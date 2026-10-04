import { BadRequestException, Injectable } from "@nestjs/common";
import {
  LeaveSource,
  LeaveStatus,
  LeaveType,
  NotificationType,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PerformanceReviewsService } from "../performance-reviews/performance-reviews.service";
import { CreateLeaveRequestDto, UpdateLeaveStatusDto } from "./dto/create-leave-request.dto";

// Mirror of AttendancePolicy defaults — read locally to avoid a circular
// dependency on AttendanceService just for the monthly-cap number.
const DEFAULT_MONTHLY_PAID_LEAVE_CAP = 2;

@Injectable()
export class LeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    // Roll the employee's performance score whenever leave state changes —
    // unpaid leaves shave the score per the rollup formula.
    private readonly performance: PerformanceReviewsService,
  ) {}

  async list(userId: string) {
    return this.prisma.leaveRequest.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  async listAll() {
    return this.prisma.leaveRequest.findMany({
      include: {
        user: true,
        approvedBy: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async balances(userId: string) {
    return this.prisma.leaveBalance.findMany({
      where: { userId },
      orderBy: { leaveType: "asc" },
    });
  }

  // Exposed separately as GET /leave/monthly-usage so the existing
  // /leave/balances response shape (plain array of LeaveBalance) stays
  // backwards-compatible. UI calls this when it needs to show "X of N
  // paid leaves used this month".
  async monthlyUsage(userId: string) {
    return this.monthlyPaidLeaveUsage(userId, new Date());
  }

  // ── Monthly cap accounting ──
  private monthRange(d: Date): { start: Date; end: Date } {
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    return { start, end };
  }

  private async monthlyPaidLeaveUsage(userId: string, ref: Date) {
    const { start, end } = this.monthRange(ref);
    const policy = await this.prisma.attendancePolicy.findFirst();
    const cap = policy?.monthlyPaidLeaveCap ?? DEFAULT_MONTHLY_PAID_LEAVE_CAP;
    const agg = await this.prisma.leaveRequest.aggregate({
      where: {
        userId,
        isPaid: true,
        status: { in: [LeaveStatus.PENDING, LeaveStatus.APPROVED] },
        startDate: { gte: start, lt: end },
      },
      _sum: { days: true },
    });
    const used = agg._sum.days ? Number(agg._sum.days) : 0;
    return { cap, used, remaining: Math.max(0, cap - used) };
  }

  // Compute how many days a request would consume. Half-day requests must
  // span a single date (we reject the multi-day half-day case rather than
  // make HR debug what 0.5 × 3-days "means").
  private resolveDays(start: Date, end: Date, isHalfDay: boolean): number {
    const ms = end.getTime() - start.getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    // +1 because endDate is inclusive (a single-date request has start===end).
    const days = Math.round(ms / dayMs) + 1;
    if (isHalfDay) {
      if (days !== 1) {
        throw new BadRequestException("Half-day leave must be a single date (startDate === endDate).");
      }
      return 0.5;
    }
    return days;
  }

  async create(userId: string, dto: CreateLeaveRequestDto) {
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (end < start) {
      throw new BadRequestException("endDate cannot be before startDate.");
    }
    const days = this.resolveDays(start, end, !!dto.isHalfDay);

    // Decide paid vs unpaid + persist atomically: two concurrent submissions
    // from the same employee would otherwise each read `used = 0`, both
    // mark themselves paid, and double-spend the monthly quota. Holding
    // both reads and the write inside a single transaction makes the
    // computed `isPaid` consistent with the row we're about to insert.
    const created = await this.prisma.$transaction(async (tx) => {
      const { start: ms, end: me } = this.monthRange(start);
      const policy = await tx.attendancePolicy.findFirst();
      const cap = policy?.monthlyPaidLeaveCap ?? DEFAULT_MONTHLY_PAID_LEAVE_CAP;
      const agg = await tx.leaveRequest.aggregate({
        where: {
          userId,
          isPaid: true,
          status: { in: [LeaveStatus.PENDING, LeaveStatus.APPROVED] },
          startDate: { gte: ms, lt: me },
        },
        _sum: { days: true },
      });
      const used = agg._sum.days ? Number(agg._sum.days) : 0;
      const isPaid = used + days <= cap;
      return tx.leaveRequest.create({
        data: {
          userId,
          leaveType: dto.leaveType,
          startDate: start,
          endDate: end,
          reason: dto.reason,
          isHalfDay: !!dto.isHalfDay,
          days: new Prisma.Decimal(days),
          source: LeaveSource.REQUESTED,
          isPaid,
        },
      });
    });
    // Unpaid (over-cap) requests drag the performance score — recompute.
    // Paid requests still trigger so the unpaid running total stays
    // consistent if HR later toggles status; cost is one tiny write.
    await this.performance.rollupPerformanceScore(userId);

    // Notify the approvers (HR + admins) so they don't have to manually
    // poll the leave page. Best-effort: a notify failure must NOT roll
    // back the user's leave submission.
    try {
      const employee = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true },
      });
      const name = employee ? `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim() || "An employee" : "An employee";
      const fmtDate = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
      const range = start.toDateString() === end.toDateString()
        ? fmtDate(start)
        : `${fmtDate(start)} → ${fmtDate(end)}`;
      const approvers = await this.findLeaveApprovers();
      await Promise.all(
        approvers
          .filter((id) => id !== userId) // employees with HR role still shouldn't self-notify
          .map((id) =>
            this.notifications.create(id, {
              type: NotificationType.GENERIC,
              title: `Leave request: ${name}`,
              body: `${dto.leaveType.replace(/_/g, " ").toLowerCase()} · ${range} · ${days} day${days === 1 ? "" : "s"}${dto.reason ? ` — "${dto.reason}"` : ""}`,
              link: `/leave`,
            }).catch(() => undefined),
          ),
      );
    } catch {
      /* non-fatal */
    }

    return created;
  }

  /** Look up users who should approve leave requests (HR + admins). */
  private async findLeaveApprovers(): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: {
        status: "ACTIVE",
        roles: { some: { role: { code: { in: ["SUPER_ADMIN", "ADMIN", "HR_MANAGER"] } } } },
      },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  async updateStatus(id: string, approverId: string, dto: UpdateLeaveStatusDto) {
    const existing = await this.prisma.leaveRequest.findUnique({ where: { id } });
    if (!existing) throw new BadRequestException("Leave request not found");

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.leaveRequest.update({
        where: { id },
        data: { status: dto.status, approvedById: approverId },
      });

      // Apply / reverse leave-balance ledger on the bucket that ACTUALLY
      // matches the request type. Previously this always hit CASUAL, so
      // SICK / MATERNITY / etc. silently drained the wrong bucket. Auto
      // deductions still default to CASUAL upstream (that's a separate
      // bucket aggregation choice), but a request marked SICK should
      // debit the SICK ledger here.
      const wasApproved = existing.status === LeaveStatus.APPROVED;
      const becomesApproved = dto.status === LeaveStatus.APPROVED;
      const ledgerType = row.leaveType ?? LeaveType.CASUAL;
      if (!wasApproved && becomesApproved && row.isPaid) {
        await tx.leaveBalance.updateMany({
          where: { userId: row.userId, leaveType: ledgerType },
          data: {
            usedDays: { increment: row.days },
            remaining: { decrement: row.days },
          },
        });
      } else if (wasApproved && !becomesApproved && row.isPaid) {
        await tx.leaveBalance.updateMany({
          where: { userId: row.userId, leaveType: ledgerType },
          data: {
            usedDays: { decrement: row.days },
            remaining: { increment: row.days },
          },
        });
      }
      return row;
    });

    // Status changes (APPROVED ↔ REJECTED/CANCELLED) shift the count of
    // unpaid leave days in the year, so recompute the performance score.
    if (existing.status !== updated.status) {
      await this.performance.rollupPerformanceScore(updated.userId);
    }

    // Notify the requester on APPROVED / REJECTED (unless approver is requester).
    try {
      if (updated.userId !== approverId) {
        const start = updated.startDate.toISOString().slice(0, 10);
        const end = updated.endDate.toISOString().slice(0, 10);
        const body =
          start === end
            ? `${start}${updated.isHalfDay ? " (half day)" : ""}`
            : `${start} → ${end}`;
        if (dto.status === "APPROVED") {
          await this.notifications.create(updated.userId, {
            type: NotificationType.LEAVE_APPROVED,
            title: "Leave approved",
            body,
            link: "/leave",
          });
        } else if (dto.status === "REJECTED") {
          await this.notifications.create(updated.userId, {
            type: NotificationType.LEAVE_REJECTED,
            title: "Leave rejected",
            body,
            link: "/leave",
          });
        }
      }
    } catch {
      /* non-fatal */
    }

    return updated;
  }
}
