import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { RoleCode, TimeEntryApprovalStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PaginationDto, getPagination } from "../../common/pagination/pagination.dto";
import { CreateTimeEntryDto } from "./dto/create-time-entry.dto";

// Working window for the Nuro 7 Kochi office: Mon–Sat, 10:00–18:00 IST.
// IST has no DST so a fixed +5:30 offset is safe. Used to cap auto-logged
// time from status transitions so an overnight task doesn't read as 16h.
const IST_OFFSET_MIN = 5 * 60 + 30;
const SHIFT_START_HOUR = 10;
const SHIFT_END_HOUR = 18;

/**
 * Total minutes of overlap between [start, end] and the working window
 * (Mon–Sat 10:00–18:00 IST). Iterates day-by-day so multi-day ranges and
 * weekend skips are handled correctly.
 */
function workingMinutesBetween(start: Date, end: Date): number {
  if (end.getTime() <= start.getTime()) return 0;

  // Shift into a fake-UTC frame whose local hours == IST hours. Lets us use
  // getUTCDay()/getUTCHours() without depending on the server timezone.
  const startIst = new Date(start.getTime() + IST_OFFSET_MIN * 60000);
  const endIst = new Date(end.getTime() + IST_OFFSET_MIN * 60000);

  let total = 0;
  // Walk one IST-day at a time from startIst's date through endIst's date.
  const cursor = new Date(Date.UTC(
    startIst.getUTCFullYear(),
    startIst.getUTCMonth(),
    startIst.getUTCDate(),
  ));
  while (cursor.getTime() <= endIst.getTime()) {
    if (cursor.getUTCDay() !== 0) { // skip Sundays
      const shiftStart = cursor.getTime() + SHIFT_START_HOUR * 60 * 60 * 1000;
      const shiftEnd = cursor.getTime() + SHIFT_END_HOUR * 60 * 60 * 1000;
      const overlapStart = Math.max(startIst.getTime(), shiftStart);
      const overlapEnd = Math.min(endIst.getTime(), shiftEnd);
      if (overlapEnd > overlapStart) {
        total += Math.floor((overlapEnd - overlapStart) / 60000);
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return total;
}

@Injectable()
export class TimeService {
  constructor(private readonly prisma: PrismaService) {}

  private isApproverRole(roles: RoleCode[] | undefined): boolean {
    const list = roles ?? [];
    return list.some(
      (r) =>
        r === RoleCode.SUPER_ADMIN ||
        r === RoleCode.ADMIN ||
        r === RoleCode.PROJECT_MANAGER ||
        r === RoleCode.HR_MANAGER,
    );
  }

  async findAll(
    userId: string | undefined,
    query: PaginationDto & { from?: string; to?: string },
  ) {
    const { skip, take, page, pageSize } = getPagination(query);
    // `undefined` userId == "all users" mode. Controller guards this so
    // only admins (or PMs) can reach this branch.
    const where: Record<string, unknown> = userId ? { userId } : {};
    // Optional date range filter — used by the Time page's "This week",
    // "Last week", etc. presets so KPIs reflect a clear window.
    if (query.from || query.to) {
      where.startTime = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.timeEntry.findMany({
        where,
        include: {
          project: true,
          task: true,
          // Always include user — when listing everyone, the table needs
          // to show whose entry it is. Harmless overhead for the single-
          // user mode.
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
        skip,
        take,
        orderBy: { startTime: "desc" },
      }),
      this.prisma.timeEntry.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
    };
  }

  async create(userId: string, dto: CreateTimeEntryDto) {
    const start = new Date(dto.startTime);
    // Two input modes: (a) explicit endTime — used by timer-based stop calls;
    // (b) duration in minutes — used by the manual "Log Time" dialog. Either
    // one yields both fields.
    let end: Date | undefined;
    let duration: number | undefined;
    if (dto.endTime) {
      end = new Date(dto.endTime);
      duration = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60000));
    } else if (typeof dto.duration === "number" && dto.duration > 0) {
      duration = dto.duration;
      end = new Date(start.getTime() + duration * 60000);
    }

    return this.prisma.timeEntry.create({
      data: {
        userId,
        projectId: dto.projectId,
        taskId: dto.taskId,
        startTime: start,
        endTime: end,
        duration,
        notes: dto.notes,
      },
    });
  }

  async getActive(userId: string) {
    return this.prisma.timeEntry.findFirst({
      where: { userId, endTime: null },
      include: { project: { select: { id: true, name: true } }, task: { select: { id: true, title: true } } },
      orderBy: { startTime: "desc" },
    });
  }

  async start(userId: string, dto: { taskId?: string; projectId?: string; notes?: string }) {
    // Auto-stop any currently running timer for this user
    await this.stopActive(userId);

    let projectId = dto.projectId;
    if (!projectId && dto.taskId) {
      const task = await this.prisma.task.findUnique({
        where: { id: dto.taskId },
        select: { projectId: true },
      });
      if (task) projectId = task.projectId;
    }
    if (!projectId) throw new BadRequestException("Project ID is required (directly or via task).");

    return this.prisma.timeEntry.create({
      data: {
        userId,
        projectId,
        taskId: dto.taskId,
        startTime: new Date(),
        notes: dto.notes,
      },
      include: { project: { select: { id: true, name: true } }, task: { select: { id: true, title: true } } },
    });
  }

  async stopActive(userId: string, notes?: string, roles?: RoleCode[]) {
    const active = await this.prisma.timeEntry.findFirst({
      where: { userId, endTime: null },
      orderBy: { startTime: "desc" },
    });
    if (!active) return null;

    const endTime = new Date();
    const duration = Math.max(0, Math.floor((endTime.getTime() - active.startTime.getTime()) / 60000));

    // Auto-approve if the person stopping is themselves an approver — saves a
    // round trip for admin/PM timers where approval is trivially their own.
    const autoApprove = this.isApproverRole(roles);

    return this.prisma.timeEntry.update({
      where: { id: active.id },
      data: {
        endTime,
        duration,
        notes: notes ?? active.notes,
        ...(autoApprove
          ? {
              approvalStatus: TimeEntryApprovalStatus.APPROVED,
              approvedById: userId,
              approvedAt: endTime,
            }
          : {}),
      },
      include: { project: { select: { id: true, name: true } }, task: { select: { id: true, title: true } } },
    });
  }

  // ── Auto-tracking triggered by task status transitions ─────────────────
  // The user's workflow is "drag task to In Progress → work → drag to Done".
  // These two methods translate that into time entries without the employee
  // ever clicking a timer button or filling a Log form.

  /**
   * Start a timer for `userId` on `taskId`. Stops any prior active timer for
   * that user first so we never end up with two running concurrently. No-op
   * if the user already has an active timer on the same task.
   */
  async autoStartForTask(userId: string, taskId: string): Promise<void> {
    const existing = await this.prisma.timeEntry.findFirst({
      where: { userId, endTime: null },
      select: { id: true, taskId: true },
    });
    if (existing?.taskId === taskId) return; // already running on this task
    if (existing) {
      // Close out the previous timer for this user before starting a new one.
      await this.stopActive(userId);
    }

    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { projectId: true },
    });
    if (!task) return; // task deleted between status change and hook

    await this.prisma.timeEntry.create({
      data: {
        userId,
        projectId: task.projectId,
        taskId,
        startTime: new Date(),
      },
    });
  }

  /**
   * Stop the active timer for `userId` on `taskId` (if any) and write a final
   * entry whose `duration` is capped to **working hours only** — Sundays,
   * after-hours, and overnight gaps don't inflate the logged time.
   */
  async autoStopForTask(
    userId: string,
    taskId: string,
    roles?: RoleCode[],
  ): Promise<void> {
    const active = await this.prisma.timeEntry.findFirst({
      where: { userId, taskId, endTime: null },
      orderBy: { startTime: "desc" },
    });
    if (!active) return;

    const endTime = new Date();
    const cappedMinutes = workingMinutesBetween(active.startTime, endTime);
    const autoApprove = this.isApproverRole(roles);

    await this.prisma.timeEntry.update({
      where: { id: active.id },
      data: {
        endTime,
        duration: cappedMinutes,
        ...(autoApprove
          ? {
              approvalStatus: TimeEntryApprovalStatus.APPROVED,
              approvedById: userId,
              approvedAt: endTime,
            }
          : {}),
      },
    });
  }

  async projectSummary(projectId: string) {
    // Total hours on a project, grouped by user and by task
    const entries = await this.prisma.timeEntry.findMany({
      where: { projectId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        task: { select: { id: true, title: true, status: true } },
      },
      orderBy: { startTime: "desc" },
    });
    const totalMinutes = entries.reduce((s, e) => s + (e.duration ?? 0), 0);
    const byUserMap: Record<string, { user: typeof entries[number]["user"]; minutes: number; count: number }> = {};
    const byTaskMap: Record<string, { task: typeof entries[number]["task"]; minutes: number; count: number }> = {};
    for (const e of entries) {
      if (!byUserMap[e.userId]) byUserMap[e.userId] = { user: e.user, minutes: 0, count: 0 };
      byUserMap[e.userId].minutes += e.duration ?? 0;
      byUserMap[e.userId].count += 1;
      if (e.task) {
        const key = e.task.id;
        if (!byTaskMap[key]) byTaskMap[key] = { task: e.task, minutes: 0, count: 0 };
        byTaskMap[key].minutes += e.duration ?? 0;
        byTaskMap[key].count += 1;
      }
    }
    return {
      totalMinutes,
      entryCount: entries.length,
      byUser: Object.values(byUserMap).sort((a, b) => b.minutes - a.minutes),
      byTask: Object.values(byTaskMap).sort((a, b) => b.minutes - a.minutes),
    };
  }

  async userPerformance(userId: string, from?: string, to?: string) {
    const where: Record<string, unknown> = { userId };
    if (from || to) {
      where.startTime = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }
    const entries = await this.prisma.timeEntry.findMany({
      where,
      include: {
        project: { select: { id: true, name: true } },
        task: { select: { id: true, title: true, status: true, priority: true } },
      },
      orderBy: { startTime: "desc" },
    });
    const totalMinutes = entries.reduce((s, e) => s + (e.duration ?? 0), 0);
    const billableMinutes = entries.filter((e) => e.billable).reduce((s, e) => s + (e.duration ?? 0), 0);

    // Group by project
    const byProjectMap: Record<string, { project: typeof entries[number]["project"]; minutes: number; count: number }> = {};
    for (const e of entries) {
      if (!e.project) continue;
      const key = e.project.id;
      if (!byProjectMap[key]) byProjectMap[key] = { project: e.project, minutes: 0, count: 0 };
      byProjectMap[key].minutes += e.duration ?? 0;
      byProjectMap[key].count += 1;
    }

    // Group by day (YYYY-MM-DD) for trend chart
    const byDayMap: Record<string, number> = {};
    for (const e of entries) {
      const day = e.startTime.toISOString().slice(0, 10);
      byDayMap[day] = (byDayMap[day] ?? 0) + (e.duration ?? 0);
    }
    const byDay = Object.entries(byDayMap)
      .map(([date, minutes]) => ({ date, minutes }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Task performance — completed tasks + average time per task
    const tasksTouched = await this.prisma.task.findMany({
      where: {
        assignedToId: userId,
        ...(from || to
          ? {
              updatedAt: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      select: { id: true, status: true, storyPoints: true },
    });
    const completedTasks = tasksTouched.filter((t) => t.status === "DONE").length;
    const totalStoryPoints = tasksTouched.reduce((s, t) => s + (t.storyPoints ?? 0), 0);
    const completedStoryPoints = tasksTouched
      .filter((t) => t.status === "DONE")
      .reduce((s, t) => s + (t.storyPoints ?? 0), 0);

    return {
      totalMinutes,
      billableMinutes,
      entryCount: entries.length,
      tasksTotal: tasksTouched.length,
      tasksCompleted: completedTasks,
      storyPointsTotal: totalStoryPoints,
      storyPointsCompleted: completedStoryPoints,
      byProject: Object.values(byProjectMap).sort((a, b) => b.minutes - a.minutes),
      byDay,
    };
  }

  async taskSummary(taskId: string) {
    const entries = await this.prisma.timeEntry.findMany({
      where: { taskId },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { startTime: "desc" },
    });
    const totalMinutes = entries.reduce((sum, e) => sum + (e.duration ?? 0), 0);
    const activeCount = entries.filter((e) => !e.endTime).length;
    const byUserMap: Record<string, { user: typeof entries[number]["user"]; minutes: number; count: number }> = {};
    for (const e of entries) {
      if (!byUserMap[e.userId]) byUserMap[e.userId] = { user: e.user, minutes: 0, count: 0 };
      byUserMap[e.userId].minutes += e.duration ?? 0;
      byUserMap[e.userId].count += 1;
    }
    return { totalMinutes, activeCount, entries, byUser: Object.values(byUserMap) };
  }

  // ── Approval workflow ──────────────────────────────────────────────────

  async pendingApproval(query: PaginationDto) {
    const { skip, take, page, pageSize } = getPagination(query);
    const where = {
      approvalStatus: TimeEntryApprovalStatus.PENDING,
      endTime: { not: null },
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.timeEntry.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
          task: { select: { id: true, title: true } },
          project: { select: { id: true, name: true } },
        },
        orderBy: { startTime: "desc" },
        skip,
        take,
      }),
      this.prisma.timeEntry.count({ where }),
    ]);
    return {
      data,
      meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
    };
  }

  async approve(id: string, approverId: string) {
    const existing = await this.prisma.timeEntry.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Time entry not found.");
    return this.prisma.timeEntry.update({
      where: { id },
      data: {
        approvalStatus: TimeEntryApprovalStatus.APPROVED,
        approvedById: approverId,
        approvedAt: new Date(),
        rejectionReason: null,
      },
    });
  }

  async reject(id: string, approverId: string, reason: string) {
    const existing = await this.prisma.timeEntry.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Time entry not found.");
    const updated = await this.prisma.timeEntry.update({
      where: { id },
      data: {
        approvalStatus: TimeEntryApprovalStatus.REJECTED,
        approvedById: approverId,
        approvedAt: new Date(),
        rejectionReason: reason,
      },
    });
    // Let the entry's author know — they'll want to resubmit.
    try {
      await this.prisma.notification.create({
        data: {
          userId: existing.userId,
          title: "Time entry rejected",
          body: reason
            ? `Your time entry was rejected: ${reason}`
            : "Your time entry was rejected.",
          actionUrl: `/time`,
        },
      });
    } catch {
      /* non-fatal */
    }
    return updated;
  }

  async bulkApprove(ids: string[], approverId: string) {
    if (!ids?.length) return { approved: 0 };
    const res = await this.prisma.timeEntry.updateMany({
      where: { id: { in: ids } },
      data: {
        approvalStatus: TimeEntryApprovalStatus.APPROVED,
        approvedById: approverId,
        approvedAt: new Date(),
        rejectionReason: null,
      },
    });
    return { approved: res.count };
  }

  async bulkReject(ids: string[], approverId: string, reason?: string) {
    if (!ids?.length) return { rejected: 0 };
    const entries = await this.prisma.timeEntry.findMany({
      where: { id: { in: ids } },
      select: { id: true, userId: true },
    });
    const res = await this.prisma.timeEntry.updateMany({
      where: { id: { in: ids } },
      data: {
        approvalStatus: TimeEntryApprovalStatus.REJECTED,
        approvedById: approverId,
        approvedAt: new Date(),
        rejectionReason: reason ?? null,
      },
    });
    try {
      await Promise.all(
        entries.map((e) =>
          this.prisma.notification.create({
            data: {
              userId: e.userId,
              title: "Time entry rejected",
              body: reason
                ? `Your time entry was rejected: ${reason}`
                : "Your time entry was rejected.",
              actionUrl: `/time`,
            },
          }),
        ),
      );
    } catch {
      /* non-fatal */
    }
    return { rejected: res.count };
  }

  async remove(id: string, userId: string) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: { id, userId },
      select: { id: true },
    });

    if (!entry) {
      return { success: false };
    }

    await this.prisma.timeEntry.delete({
      where: { id: entry.id },
    });

    return { success: true };
  }
}
