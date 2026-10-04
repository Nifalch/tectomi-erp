import { Injectable } from "@nestjs/common";
import { NotificationStatus, NotificationType, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotificationsGateway } from "./notifications.gateway";

export interface CreateNotificationInput {
  type: NotificationType | keyof typeof NotificationType;
  title: string;
  body?: string;
  link?: string;
  taskId?: string;
  projectId?: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
  ) {}

  /** List current user's notifications; optionally only unread. */
  async list(userId: string, opts: { unread?: boolean; limit?: number } = {}) {
    await this.opportunisticBackfill(userId);
    const where: Prisma.NotificationWhereInput = { userId };
    if (opts.unread) where.readAt = null;
    const take = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    return this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
    });
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    await this.opportunisticBackfill(userId);
    const count = await this.prisma.notification.count({
      where: { userId, readAt: null },
    });
    return { count };
  }

  /**
   * Best-effort creation of PROJECT_DEADLINE_SOON + HOLIDAY_UPCOMING
   * notifications for the current user. Never throws — any failure is
   * swallowed so the parent list/unreadCount request keeps working.
   */
  private async opportunisticBackfill(userId: string): Promise<void> {
    try {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // ── Project deadlines within next 3 days ──
      const in3Days = new Date(startOfToday);
      in3Days.setDate(in3Days.getDate() + 3);
      in3Days.setHours(23, 59, 59, 999);

      const dueSoonProjects = await this.prisma.project.findMany({
        where: {
          endDate: { gte: startOfToday, lte: in3Days },
          status: { notIn: ["COMPLETED", "CANCELLED"] },
          OR: [
            { managerId: userId },
            { members: { some: { userId } } },
          ],
        },
        select: { id: true, name: true, endDate: true },
      });

      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      for (const p of dueSoonProjects) {
        if (!p.endDate) continue;
        const existing = await this.prisma.notification.count({
          where: {
            userId,
            projectId: p.id,
            type: NotificationType.PROJECT_DEADLINE_SOON,
            createdAt: { gte: since24h },
          },
        });
        if (existing > 0) continue;
        const msLeft = p.endDate.getTime() - startOfToday.getTime();
        const daysLeft = Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
        const dueStr = p.endDate.toISOString().slice(0, 10);
        await this.create(userId, {
          type: NotificationType.PROJECT_DEADLINE_SOON,
          title: `Project deadline in ${daysLeft} day${daysLeft === 1 ? "" : "s"}: ${p.name}`,
          body: `Due on ${dueStr}`,
          link: `/projects/${p.id}`,
          projectId: p.id,
        });
      }

      // ── Holidays within next 7 days ──
      const in7Days = new Date(startOfToday);
      in7Days.setDate(in7Days.getDate() + 7);
      in7Days.setHours(23, 59, 59, 999);

      const holidays = await this.prisma.holiday.findMany({
        where: { date: { gte: startOfToday, lte: in7Days } },
        select: { id: true, name: true, date: true },
      });

      const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const weekdayFmt = new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      });
      for (const h of holidays) {
        const dayStart = new Date(h.date.getFullYear(), h.date.getMonth(), h.date.getDate());
        const dayEnd = new Date(dayStart);
        dayEnd.setHours(23, 59, 59, 999);
        // Dedupe: any HOLIDAY_UPCOMING for this user referencing the same
        // holiday date in the last 7 days counts as "already notified".
        // We encode the date into the title suffix to keep the dedupe cheap.
        const dateLabel = weekdayFmt.format(h.date);
        const title = `${h.name} — ${dateLabel}`;
        const existing = await this.prisma.notification.count({
          where: {
            userId,
            type: NotificationType.HOLIDAY_UPCOMING,
            title,
            createdAt: { gte: since7d },
          },
        });
        if (existing > 0) continue;
        await this.create(userId, {
          type: NotificationType.HOLIDAY_UPCOMING,
          title,
          link: "/holidays",
        });
      }
    } catch {
      /* non-fatal — never block list/unreadCount on backfill failure */
    }
  }

  /** Mark one notification read (scoped to the owning user). */
  async markRead(id: string, userId?: string) {
    const where: Prisma.NotificationWhereUniqueInput = { id };
    const existing = await this.prisma.notification.findUnique({ where });
    if (!existing) return { success: true, alreadyDeleted: true };
    if (userId && existing.userId !== userId) {
      // Silently no-op on cross-user markRead so we don't leak ownership info.
      return { success: true, notOwner: true };
    }
    return this.prisma.notification.update({
      where,
      data: { status: NotificationStatus.READ, readAt: new Date() },
    });
  }

  /** Mark every unread notification for the caller as read. */
  async markAllRead(userId: string) {
    const res = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { status: NotificationStatus.READ, readAt: new Date() },
    });
    return { updated: res.count };
  }

  /**
   * Create a notification. Used by other modules (tasks, sprints, etc.).
   * Best-effort — swallows gateway errors so notification creation never
   * breaks the calling flow.
   */
  async create(userId: string, input: CreateNotificationInput) {
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        type: input.type as NotificationType,
        title: input.title,
        body: input.body,
        link: input.link,
        actionUrl: input.link,
        taskId: input.taskId,
        projectId: input.projectId,
      },
    });
    try {
      this.gateway.notifyUser(userId, notification);
    } catch {
      /* non-fatal */
    }
    return notification;
  }
}
