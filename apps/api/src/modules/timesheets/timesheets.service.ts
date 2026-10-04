import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { NotificationType, Prisma, RoleCode, TimesheetStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { getPagination } from "../../common/pagination/pagination.dto";
import { NotificationsService } from "../notifications/notifications.service";
import {
  CreateTimesheetDto,
  ListTimesheetsDto,
  RejectTimesheetDto,
} from "./dto/timesheet.dto";

type CurrentUser = { id: string; roles?: RoleCode[] };

function isHr(user: CurrentUser): boolean {
  return !!(
    user.roles?.includes(RoleCode.SUPER_ADMIN) ||
    user.roles?.includes(RoleCode.ADMIN) ||
    user.roles?.includes(RoleCode.HR_MANAGER)
  );
}

function canApprove(user: CurrentUser): boolean {
  return (
    isHr(user) ||
    !!user.roles?.includes(RoleCode.PROJECT_MANAGER)
  );
}

@Injectable()
export class TimesheetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(user: CurrentUser, query: ListTimesheetsDto) {
    const { skip, take, page, pageSize } = getPagination(query);
    const where: Prisma.TimesheetSubmissionWhereInput = {};

    if (!isHr(user) && !user.roles?.includes(RoleCode.PROJECT_MANAGER)) {
      where.userId = user.id;
    } else if (query.userId) {
      where.userId = query.userId;
    }
    if (query.status) where.status = query.status;
    if (query.from || query.to) {
      where.weekStart = {};
      if (query.from) (where.weekStart as Prisma.DateTimeFilter).gte = new Date(query.from);
      if (query.to) (where.weekStart as Prisma.DateTimeFilter).lte = new Date(query.to);
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.timesheetSubmission.findMany({
        where,
        skip,
        take,
        include: { user: true, approvedBy: true },
        orderBy: { weekStart: "desc" },
      }),
      this.prisma.timesheetSubmission.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
    };
  }

  async get(id: string, user: CurrentUser) {
    const ts = await this.prisma.timesheetSubmission.findUnique({
      where: { id },
      include: { user: true, approvedBy: true },
    });
    if (!ts) throw new NotFoundException("Timesheet not found");
    if (!isHr(user) && !user.roles?.includes(RoleCode.PROJECT_MANAGER) && ts.userId !== user.id) {
      throw new ForbiddenException("Cannot access this timesheet");
    }

    const entries = await this.prisma.timeEntry.findMany({
      where: {
        userId: ts.userId,
        startTime: { gte: ts.weekStart, lte: ts.weekEnd },
      },
      include: { project: true, task: true },
      orderBy: { startTime: "asc" },
    });

    return { ...ts, entries };
  }

  async create(user: CurrentUser, dto: CreateTimesheetDto) {
    const weekStart = new Date(dto.weekStart);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    weekEnd.setUTCHours(23, 59, 59, 999);

    const entries = await this.prisma.timeEntry.findMany({
      where: {
        userId: user.id,
        startTime: { gte: weekStart, lte: weekEnd },
      },
      select: { duration: true },
    });
    const totalMinutes = entries.reduce((sum, e) => sum + (e.duration ?? 0), 0);
    const totalHours = new Prisma.Decimal(totalMinutes / 60);

    return this.prisma.timesheetSubmission.upsert({
      where: { userId_weekStart: { userId: user.id, weekStart } },
      create: {
        userId: user.id,
        weekStart,
        weekEnd,
        totalHours,
        status: TimesheetStatus.DRAFT,
      },
      update: {
        weekEnd,
        totalHours,
      },
    });
  }

  async submit(id: string, user: CurrentUser) {
    const ts = await this.prisma.timesheetSubmission.findUnique({ where: { id } });
    if (!ts) throw new NotFoundException("Timesheet not found");
    if (ts.userId !== user.id) throw new ForbiddenException("Only owner can submit");
    const updated = await this.prisma.timesheetSubmission.update({
      where: { id },
      data: { status: TimesheetStatus.SUBMITTED, submittedAt: new Date() },
    });

    // Ping the approver pool (HR + PM + admins) so the timesheet doesn't
    // sit unreviewed. Mirrors the leave-submitted flow.
    try {
      const employee = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { firstName: true, lastName: true },
      });
      const employeeName = employee
        ? `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim() || "An employee"
        : "An employee";
      const approvers = await this.prisma.user.findMany({
        where: {
          status: "ACTIVE",
          roles: { some: { role: { code: { in: ["SUPER_ADMIN", "ADMIN", "HR_MANAGER", "PROJECT_MANAGER"] } } } },
        },
        select: { id: true },
      });
      const weekStart = updated.weekStart.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
      await Promise.all(
        approvers
          .filter((u) => u.id !== user.id)
          .map((u) =>
            this.notifications.create(u.id, {
              type: NotificationType.GENERIC,
              title: `Timesheet submitted: ${employeeName}`,
              body: `Week of ${weekStart} · ${updated.totalHours ?? 0}h. Approve or send back for changes.`,
              link: `/time/approvals`,
            }).catch(() => undefined),
          ),
      );
    } catch {
      /* non-fatal */
    }

    return updated;
  }

  async approve(id: string, user: CurrentUser) {
    if (!canApprove(user)) throw new ForbiddenException("Cannot approve");
    return this.prisma.timesheetSubmission.update({
      where: { id },
      data: {
        status: TimesheetStatus.APPROVED,
        approvedAt: new Date(),
        approvedById: user.id,
      },
    });
  }

  async reject(id: string, user: CurrentUser, dto: RejectTimesheetDto) {
    if (!canApprove(user)) throw new ForbiddenException("Cannot reject");
    return this.prisma.timesheetSubmission.update({
      where: { id },
      data: {
        status: TimesheetStatus.REJECTED,
        comments: dto.comments,
        approvedById: user.id,
      },
    });
  }

  async remove(id: string, user: CurrentUser) {
    const ts = await this.prisma.timesheetSubmission.findUnique({ where: { id } });
    if (!ts) throw new NotFoundException("Timesheet not found");
    const hr = isHr(user);
    if (ts.userId === user.id) {
      if (ts.status !== TimesheetStatus.DRAFT && !hr) {
        throw new BadRequestException("Can only delete DRAFT timesheets");
      }
    } else if (!hr) {
      throw new ForbiddenException("Cannot delete this timesheet");
    }
    await this.prisma.timesheetSubmission.delete({ where: { id } });
    return { success: true };
  }
}
