import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  LeaveStatus,
  NotificationType,
  Prisma,
  ReviewCycleStatus,
  ReviewStatus,
  RoleCode,
  UserStatus,
} from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { getPagination } from "../../common/pagination/pagination.dto";
import { NotificationsService } from "../notifications/notifications.service";
import { CreateCycleDto } from "./dto/create-cycle.dto";
import {
  Feedback360Dto,
  ListReviewsDto,
  ManagerReviewDto,
  SelfReviewDto,
} from "./dto/review.dto";

type CurrentUser = { id: string; roles?: RoleCode[] };

function isHr(user: CurrentUser): boolean {
  return !!(
    user.roles?.includes(RoleCode.SUPER_ADMIN) ||
    user.roles?.includes(RoleCode.ADMIN) ||
    user.roles?.includes(RoleCode.HR_MANAGER)
  );
}

@Injectable()
export class PerformanceReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Cycles ──
  async listCycles(user: CurrentUser) {
    if (isHr(user)) {
      return this.prisma.reviewCycle.findMany({ orderBy: { startDate: "desc" } });
    }
    return this.prisma.reviewCycle.findMany({
      where: { status: ReviewCycleStatus.ACTIVE },
      orderBy: { startDate: "desc" },
    });
  }

  async createCycle(dto: CreateCycleDto) {
    return this.prisma.reviewCycle.create({
      data: {
        name: dto.name,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        reviewType: dto.reviewType ?? "QUARTERLY",
        status: ReviewCycleStatus.DRAFT,
      },
    });
  }

  async activateCycle(id: string) {
    const cycle = await this.prisma.reviewCycle.findUnique({ where: { id } });
    if (!cycle) throw new NotFoundException("Cycle not found");

    const employees = await this.prisma.employeeProfile.findMany({
      where: { user: { status: UserStatus.ACTIVE } },
      include: { user: true },
    });

    const superAdmin = await this.prisma.user.findFirst({
      where: { roles: { some: { role: { code: RoleCode.SUPER_ADMIN } } } },
      select: { id: true },
    });

    for (const emp of employees) {
      let reviewerId = superAdmin?.id ?? emp.userId;
      if (emp.managerName) {
        const parts = emp.managerName.trim().split(/\s+/);
        if (parts.length >= 2) {
          const manager = await this.prisma.user.findFirst({
            where: { firstName: parts[0], lastName: parts.slice(1).join(" ") },
            select: { id: true },
          });
          if (manager) reviewerId = manager.id;
        }
      }

      const review = await this.prisma.performanceReview.upsert({
        where: { cycleId_employeeId: { cycleId: id, employeeId: emp.userId } },
        create: {
          cycleId: id,
          employeeId: emp.userId,
          reviewerId,
          status: ReviewStatus.SELF_REVIEW,
        },
        update: {},
      });
      // Nudge the employee (and their reviewer) to start the self-review.
      // Best-effort: notification failures don't break cycle activation.
      try {
        const cycle = await this.prisma.reviewCycle.findUnique({
          where: { id },
          select: { name: true },
        });
        await this.notifications.create(emp.userId, {
          type: NotificationType.GENERIC,
          title: `Self-review: ${cycle?.name ?? "Performance cycle"}`,
          body: "Your self-review window is open. Reflect on the last cycle and submit before the deadline.",
          link: `/my-performance`,
        }).catch(() => undefined);
        if (reviewerId && reviewerId !== emp.userId) {
          await this.notifications.create(reviewerId, {
            type: NotificationType.GENERIC,
            title: `Review assigned: ${cycle?.name ?? "Performance cycle"}`,
            body: "You've been assigned as the reviewer. You'll be able to write your review once self-review is in.",
            link: `/performance/reviews/${review.id}`,
          }).catch(() => undefined);
        }
      } catch {
        /* non-fatal */
      }
    }

    return this.prisma.reviewCycle.update({
      where: { id },
      data: { status: ReviewCycleStatus.ACTIVE },
    });
  }

  async completeCycle(id: string) {
    const cycle = await this.prisma.reviewCycle.update({
      where: { id },
      data: { status: ReviewCycleStatus.COMPLETED },
    });
    // Safety net: re-roll every employee in this cycle once it's officially
    // closed, in case some finalRatings were edited directly in the DB or a
    // manager-review submit ran before this rollup helper existed.
    const employeeIds = await this.prisma.performanceReview.findMany({
      where: { cycleId: id, status: ReviewStatus.COMPLETED, finalRating: { not: null } },
      select: { employeeId: true },
      distinct: ["employeeId"],
    });
    await Promise.all(
      employeeIds.map((row) => this.rollupPerformanceScore(row.employeeId)),
    );
    return cycle;
  }

  /**
   * One-shot backfill: recompute performanceScore for every user who has at
   * least one completed review. Useful right after deploying the rollup
   * logic, since existing rows otherwise wait until their next review.
   * Returns the number of employees touched.
   */
  async rollupAllEmployeeScores(): Promise<{ updated: number }> {
    const rows = await this.prisma.performanceReview.findMany({
      where: { status: ReviewStatus.COMPLETED, finalRating: { not: null } },
      select: { employeeId: true },
      distinct: ["employeeId"],
    });
    await Promise.all(rows.map((r) => this.rollupPerformanceScore(r.employeeId)));
    return { updated: rows.length };
  }

  // ── Reviews ──
  async listReviews(user: CurrentUser, query: ListReviewsDto) {
    const { skip, take, page, pageSize } = getPagination(query);
    const where: Prisma.PerformanceReviewWhereInput = {};
    if (query.cycleId) where.cycleId = query.cycleId;
    if (query.employeeId) where.employeeId = query.employeeId;
    if (query.reviewerId) where.reviewerId = query.reviewerId;

    if (!isHr(user)) {
      where.OR = [{ reviewerId: user.id }, { employeeId: user.id }];
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.performanceReview.findMany({
        where,
        skip,
        take,
        include: { cycle: true, employee: true, reviewer: true },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.performanceReview.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
    };
  }

  async getReview(id: string, user: CurrentUser) {
    const review = await this.prisma.performanceReview.findUnique({
      where: { id },
      include: {
        cycle: true,
        employee: true,
        reviewer: true,
        feedback360: { include: { reviewer: true } },
      },
    });
    if (!review) throw new NotFoundException("Review not found");
    if (!isHr(user) && review.employeeId !== user.id && review.reviewerId !== user.id) {
      throw new ForbiddenException("Cannot access this review");
    }
    return review;
  }

  async listSelfReviews(userId: string) {
    return this.prisma.performanceReview.findMany({
      where: { employeeId: userId, status: ReviewStatus.SELF_REVIEW },
      include: { cycle: true, employee: true, reviewer: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async listReviewsToReview(userId: string) {
    // Surface every review where the user is the reviewer that's STILL
    // open (not yet COMPLETED). Previously this only returned rows in
    // MANAGER_REVIEW — but that meant the reviewer was blind to reviews
    // stuck in SELF_REVIEW (employee hasn't submitted yet), which is
    // exactly when they need visibility so they can nudge the employee
    // or proceed without the self-review when warranted.
    return this.prisma.performanceReview.findMany({
      where: {
        reviewerId: userId,
        status: { in: [ReviewStatus.SELF_REVIEW, ReviewStatus.MANAGER_REVIEW] },
      },
      include: { cycle: true, employee: true, reviewer: true },
      orderBy: [
        // MANAGER_REVIEW (ready for the reviewer) first, SELF_REVIEW
        // (waiting on employee) second.
        { status: "desc" },
        { createdAt: "desc" },
      ],
    });
  }

  async submitSelfReview(id: string, user: CurrentUser, dto: SelfReviewDto) {
    const review = await this.prisma.performanceReview.findUnique({ where: { id } });
    if (!review) throw new NotFoundException("Review not found");
    if (review.employeeId !== user.id) {
      throw new ForbiddenException("Only the employee can submit a self review");
    }
    return this.prisma.performanceReview.update({
      where: { id },
      data: {
        selfRating: new Prisma.Decimal(dto.selfRating),
        selfComments: dto.selfComments,
        strengths: dto.strengths,
        improvementAreas: dto.improvementAreas,
        status: ReviewStatus.MANAGER_REVIEW,
        submittedAt: new Date(),
      },
    });
  }

  async submitManagerReview(id: string, user: CurrentUser, dto: ManagerReviewDto) {
    const review = await this.prisma.performanceReview.findUnique({ where: { id } });
    if (!review) throw new NotFoundException("Review not found");
    if (!isHr(user) && review.reviewerId !== user.id) {
      throw new ForbiddenException("Only the reviewer can submit a manager review");
    }
    const updated = await this.prisma.performanceReview.update({
      where: { id },
      data: {
        managerRating: new Prisma.Decimal(dto.managerRating),
        managerComments: dto.managerComments,
        finalRating: new Prisma.Decimal(dto.finalRating),
        goalsForNext: dto.goalsForNext,
        status: ReviewStatus.COMPLETED,
        completedAt: new Date(),
      },
    });
    await this.rollupPerformanceScore(review.employeeId);
    return updated;
  }

  /**
   * Roll the latest finalRatings into EmployeeProfile.performanceScore so the
   * value used by the HR dashboard and resource heatmap reflects actual
   * completed reviews instead of whatever someone last typed by hand.
   *
   * Formula:
   *   base    = avg(last {@link ROLLUP_WINDOW} completed-cycle finalRatings)
   *   penalty = (unpaid leave days this calendar year) × {@link UNPAID_LEAVE_PENALTY}
   *   score   = clamp(base − penalty, 0, 5)
   *
   * Both `finalRating` and `performanceScore` are 1–5 in the UI, so no scale
   * conversion. If there are no completed reviews yet, base defaults to the
   * existing stored score (so we don't blow away a manually-set value),
   * minus any penalty.
   *
   * Public so the leave + attendance services can call it whenever an
   * unpaid leave is created/cancelled. Idempotent — safe to call repeatedly.
   *
   * Uses updateMany — silently no-ops if the user has no EmployeeProfile
   * (e.g. external reviewers, contractors).
   */
  private static readonly ROLLUP_WINDOW = 4;
  private static readonly UNPAID_LEAVE_PENALTY = 0.1; // points off per unpaid leave day this year
  async rollupPerformanceScore(employeeId: string): Promise<void> {
    const [recent, profile, unpaid] = await Promise.all([
      this.prisma.performanceReview.findMany({
        where: {
          employeeId,
          status: ReviewStatus.COMPLETED,
          finalRating: { not: null },
        },
        orderBy: { completedAt: "desc" },
        take: PerformanceReviewsService.ROLLUP_WINDOW,
        select: { finalRating: true },
      }),
      this.prisma.employeeProfile.findUnique({
        where: { userId: employeeId },
        select: { performanceScore: true },
      }),
      // Unpaid leave days for the current calendar year. Includes both
      // user-requested-over-cap and auto half-day / late-penalty rows.
      this.prisma.leaveRequest.aggregate({
        where: {
          userId: employeeId,
          isPaid: false,
          status: { in: [LeaveStatus.PENDING, LeaveStatus.APPROVED] },
          startDate: {
            gte: new Date(new Date().getFullYear(), 0, 1),
            lt: new Date(new Date().getFullYear() + 1, 0, 1),
          },
        },
        _sum: { days: true },
      }),
    ]);

    // Base: prefer the rolling review average. If no reviews yet, keep the
    // current stored score as the starting point (so we don't reset a
    // manually-set 4.8 to 0 just because the team hasn't run reviews).
    let base: number;
    if (recent.length > 0) {
      const sum = recent.reduce(
        (acc, r) => acc + (r.finalRating ? r.finalRating.toNumber() : 0),
        0,
      );
      base = sum / recent.length;
    } else if (profile?.performanceScore != null) {
      base = profile.performanceScore.toNumber();
    } else {
      // Nothing to roll up — leave the column null/unset.
      return;
    }

    const unpaidDays = unpaid._sum.days ? Number(unpaid._sum.days) : 0;
    const penalty = unpaidDays * PerformanceReviewsService.UNPAID_LEAVE_PENALTY;
    const score = Math.max(0, Math.min(5, base - penalty));

    await this.prisma.employeeProfile.updateMany({
      where: { userId: employeeId },
      data: { performanceScore: new Prisma.Decimal(score.toFixed(2)) },
    });
  }

  // ── 360 Feedback ──
  async addFeedback360(reviewId: string, user: CurrentUser, dto: Feedback360Dto) {
    const review = await this.prisma.performanceReview.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException("Review not found");
    return this.prisma.review360Feedback.create({
      data: {
        reviewId,
        reviewerId: user.id,
        relationship: dto.relationship,
        rating: new Prisma.Decimal(dto.rating),
        strengths: dto.strengths,
        improvements: dto.improvements,
        comments: dto.comments,
      },
    });
  }

  async listFeedback360(reviewId: string, user: CurrentUser) {
    const review = await this.prisma.performanceReview.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException("Review not found");
    if (!isHr(user) && review.employeeId !== user.id && review.reviewerId !== user.id) {
      throw new ForbiddenException("Cannot access 360 feedback for this review");
    }
    return this.prisma.review360Feedback.findMany({
      where: { reviewId },
      include: { reviewer: true },
      orderBy: { submittedAt: "desc" },
    });
  }
}
