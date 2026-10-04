import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InvoiceStatus, NotificationType, ProjectStatus, TaskStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotificationsService } from "./notifications.service";

/**
 * Daily notification broadcaster. Runs the chores that can't be fired
 * by an inline event handler — overdue invoices, project deadlines,
 * holidays one-week-out, task due-soon, etc.
 *
 * One single service so the cron schedule is auditable in one place
 * instead of scattered across feature modules. Every job is wrapped in
 * try/catch so a single failure doesn't poison the rest of the run.
 */
@Injectable()
export class NotificationsScheduler {
  private readonly log = new Logger(NotificationsScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Schedules ────────────────────────────────────────────────────────────
  // Run the full sweep daily at 9 AM. One pass through each domain
  // keeps the inbox quiet — a flurry of staggered notifications is
  // worse than one tidy daily digest.

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async dailySweep() {
    this.log.log("Running daily notification sweep…");
    await Promise.all([
      this.safe("tasks due-soon", () => this.tasksDueSoon()),
      this.safe("tasks overdue", () => this.tasksOverdue()),
      this.safe("projects deadline-soon", () => this.projectsDeadlineSoon()),
      this.safe("projects overdue", () => this.projectsOverdue()),
      this.safe("invoices overdue", () => this.invoicesOverdue()),
      this.safe("holidays upcoming", () => this.holidaysUpcoming()),
      this.safe("work anniversaries", () => this.workAnniversaries()),
      this.safe("stale timers", () => this.staleTimers()),
    ]);
    this.log.log("Daily notification sweep complete.");
  }

  private async safe(label: string, run: () => Promise<unknown>) {
    try {
      await run();
    } catch (e) {
      this.log.error(`[${label}] failed`, (e as Error)?.stack ?? e);
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async findAdmins(extraRoles: string[] = []): Promise<string[]> {
    const codes = ["SUPER_ADMIN", "ADMIN", ...extraRoles];
    const users = await this.prisma.user.findMany({
      where: {
        status: "ACTIVE",
        roles: { some: { role: { code: { in: codes as any } } } },
      },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  private fmtMoney(n: number): string {
    return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  }

  private fmtDate(d: Date): string {
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  }

  private daysUntil(d: Date): number {
    return Math.round((d.getTime() - Date.now()) / 86400000);
  }

  // ── 1. Task due-soon (≤ 24h, not done) ───────────────────────────────────
  //
  // Mirrors the existing TasksService.runDueReminders without the email
  // side-effect (the email path stays for the manual admin endpoint;
  // here we only want the in-app notification to keep noise low).

  private async tasksDueSoon() {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const due = await this.prisma.task.findMany({
      where: {
        dueDate: { not: null, lte: in24h, gt: now },
        status: { notIn: [TaskStatus.DONE] },
        reminderSentAt: null,
        assignedToId: { not: null },
      },
      select: { id: true, title: true, dueDate: true, assignedToId: true, projectId: true, project: { select: { name: true } } },
    });
    for (const t of due) {
      if (!t.assignedToId) continue;
      await this.notifications.create(t.assignedToId, {
        type: NotificationType.TASK_DUE_SOON,
        title: `Due soon: ${t.title}`,
        body: t.dueDate ? `Due ${this.fmtDate(t.dueDate)} · ${t.project?.name ?? ""}`.trim() : t.project?.name,
        link: `/tasks/${t.id}`,
        taskId: t.id,
        projectId: t.projectId,
      }).catch(() => undefined);
      await this.prisma.task.update({ where: { id: t.id }, data: { reminderSentAt: now } });
    }
    this.log.log(`tasks-due-soon: notified ${due.length}`);
  }

  // ── 2. Task overdue (dueDate < now, still open) ──────────────────────────
  //
  // The OverdueReminderSentAt column doesn't exist, so we rely on a
  // 7-day in-memory dedupe instead: only fire if no TASK_DUE_SOON or
  // overdue notification has been written for this task in the last
  // 24h. Goes to the assignee + project manager so leadership sees
  // slipping work.

  private async tasksOverdue() {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const overdue = await this.prisma.task.findMany({
      where: {
        dueDate: { not: null, lt: now },
        status: { notIn: [TaskStatus.DONE] },
        assignedToId: { not: null },
      },
      select: {
        id: true, title: true, dueDate: true, assignedToId: true, projectId: true,
        project: { select: { name: true, managerId: true } },
      },
    });
    let fired = 0;
    for (const t of overdue) {
      if (!t.assignedToId) continue;
      const recipients = new Set<string>([t.assignedToId]);
      if (t.project?.managerId) recipients.add(t.project.managerId);
      const daysLate = -this.daysUntil(t.dueDate!);
      const body = `"${t.title}" is ${daysLate === 0 ? "due today" : `${daysLate} day${daysLate === 1 ? "" : "s"} overdue`}${t.project?.name ? ` on ${t.project.name}` : ""}.`;
      // Dedupe per-recipient: previously the query missed userId, so once
      // any recipient (usually the assignee) got the notification the PM
      // was silently skipped because "someone recent existed for this task".
      await Promise.all(
        Array.from(recipients).map(async (uid) => {
          const recent = await this.prisma.notification.findFirst({
            where: {
              taskId: t.id,
              userId: uid,
              createdAt: { gte: yesterday },
              type: { in: [NotificationType.TASK_DUE_SOON, NotificationType.GENERIC] },
            },
            select: { id: true },
          });
          if (recent) return;
          await this.notifications.create(uid, {
            type: NotificationType.GENERIC,
            title: `Overdue: ${t.title}`,
            body,
            link: `/tasks/${t.id}`,
            taskId: t.id,
            projectId: t.projectId,
          }).catch(() => undefined);
        }),
      );
      fired++;
    }
    this.log.log(`tasks-overdue: notified ${fired}`);
  }

  // ── 3. Project deadline soon (≤ 7 days, status ACTIVE) ───────────────────
  //
  // The existing opportunistic backfill only fires when a user visits
  // /notifications. This proactive cron makes sure managers + admins
  // hear about it regardless of who logged in.

  private async projectsDeadlineSoon() {
    const now = new Date();
    const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const projects = await this.prisma.project.findMany({
      where: {
        status: ProjectStatus.ACTIVE,
        endDate: { not: null, lte: in7d, gte: now },
      },
      select: {
        id: true, name: true, endDate: true, managerId: true,
        members: { select: { userId: true } },
      },
    });
    let fired = 0;
    const admins = await this.findAdmins();
    for (const p of projects) {
      const recipients = new Set<string>([
        ...p.members.map((m) => m.userId),
        ...(p.managerId ? [p.managerId] : []),
        ...admins,
      ]);
      const daysLeft = this.daysUntil(p.endDate!);
      const body = `${p.name} ends in ${daysLeft <= 0 ? "less than a day" : `${daysLeft} day${daysLeft === 1 ? "" : "s"}`}.`;
      await Promise.all(
        Array.from(recipients).map(async (uid) => {
          // Per-user dedupe — previously a single PROJECT_DEADLINE_SOON
          // row for the project blocked notifications to every other
          // recipient on subsequent runs. Now each user is gated by their
          // OWN last-24h history.
          const already = await this.prisma.notification.findFirst({
            where: {
              userId: uid,
              projectId: p.id,
              type: NotificationType.PROJECT_DEADLINE_SOON,
              createdAt: { gte: yesterday },
            },
            select: { id: true },
          });
          if (already) return;
          await this.notifications.create(uid, {
            type: NotificationType.PROJECT_DEADLINE_SOON,
            title: `Project ending soon: ${p.name}`,
            body,
            link: `/projects/${p.id}`,
            projectId: p.id,
          }).catch(() => undefined);
          fired++;
        }),
      );
    }
    this.log.log(`projects-deadline-soon: notified ${fired}`);
  }

  // ── 4. Project overdue (endDate < now, status still ACTIVE) ──────────────

  private async projectsOverdue() {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const overdue = await this.prisma.project.findMany({
      where: {
        status: ProjectStatus.ACTIVE,
        endDate: { not: null, lt: now },
      },
      select: { id: true, name: true, endDate: true, managerId: true },
    });
    let fired = 0;
    const admins = await this.findAdmins();
    for (const p of overdue) {
      const recent = await this.prisma.notification.findFirst({
        where: {
          projectId: p.id,
          createdAt: { gte: yesterday },
          type: NotificationType.GENERIC,
        },
        select: { id: true },
      });
      if (recent) continue;
      const recipients = new Set<string>([
        ...(p.managerId ? [p.managerId] : []),
        ...admins,
      ]);
      const daysLate = -this.daysUntil(p.endDate!);
      await Promise.all(
        Array.from(recipients).map((uid) =>
          this.notifications.create(uid, {
            type: NotificationType.GENERIC,
            title: `Project overdue: ${p.name}`,
            body: `Ended ${daysLate === 0 ? "today" : `${daysLate} day${daysLate === 1 ? "" : "s"} ago`} and status is still ACTIVE. Either close it or extend the end date.`,
            link: `/projects/${p.id}`,
            projectId: p.id,
          }).catch(() => undefined),
        ),
      );
      fired++;
    }
    this.log.log(`projects-overdue: notified ${fired}`);
  }

  // ── 5. Invoice overdue (status SENT, dueDate < now) ──────────────────────
  //
  // Also flips the invoice's status to OVERDUE on the first sweep so
  // the dashboard pill turns red without manual intervention. Notifies
  // finance + admins + project manager. (Invoice schema doesn't have a
  // PARTIAL status — only DRAFT/SENT/PAID/OVERDUE/VOID — and dueDate
  // is non-nullable, so no `not: null` filter needed.)

  private async invoicesOverdue() {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    // Include OVERDUE too — without it, the second daily sweep would skip
    // invoices that were already flipped on day 1, so they'd never be
    // re-notified despite staying unpaid. The 24h dedupe below still
    // prevents same-day spam.
    const overdue = await this.prisma.invoice.findMany({
      where: {
        status: { in: [InvoiceStatus.SENT, InvoiceStatus.OVERDUE] },
        dueDate: { lt: now },
      },
      include: {
        client: { select: { companyName: true } },
        project: { select: { managerId: true, name: true } },
      },
    });
    const adminFinance = await this.findAdmins(["FINANCE_MANAGER"]);
    let fired = 0;
    for (const inv of overdue) {
      // Flip status the first time we see it (SENT → OVERDUE). Subsequent
      // sweeps find it already OVERDUE and no-op this branch.
      if (inv.status !== InvoiceStatus.OVERDUE) {
        await this.prisma.invoice.update({
          where: { id: inv.id },
          data: { status: InvoiceStatus.OVERDUE },
        }).catch(() => undefined);
      }
      // Dedupe per-recipient — only fire to a user we haven't notified for
      // this exact invoice in the last 24h. Use exact-title equality (not
      // startsWith) so "INV-001" doesn't accidentally match "INV-0011".
      // Without this, once any single recipient was notified the entire
      // group was skipped on subsequent runs.
      const invoiceTitle = `Invoice overdue: ${inv.invoiceNumber}`;
      const recipients = new Set<string>(adminFinance);
      if (inv.project?.managerId) recipients.add(inv.project.managerId);
      const daysLate = -this.daysUntil(inv.dueDate!);
      const body = `${inv.client?.companyName ?? "Client"} · ${this.fmtMoney(Number(inv.total))} · ${daysLate} day${daysLate === 1 ? "" : "s"} late.`;
      await Promise.all(
        Array.from(recipients).map(async (uid) => {
          // Per-user dedupe: skip this recipient if they already received
          // this exact invoice's overdue notification in the last 24h.
          const already = await this.prisma.notification.findFirst({
            where: { userId: uid, title: invoiceTitle, createdAt: { gte: yesterday } },
            select: { id: true },
          });
          if (already) return;
          await this.notifications.create(uid, {
            type: NotificationType.GENERIC,
            title: invoiceTitle,
            body,
            link: `/invoices/${inv.id}/print`,
            projectId: inv.projectId ?? undefined,
          }).catch(() => undefined);
        }),
      );
      fired++;
    }
    this.log.log(`invoices-overdue: flipped + notified ${fired}`);
  }

  // ── 6. Holiday upcoming (one-week-out broadcast) ─────────────────────────

  private async holidaysUpcoming() {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const oneWeekOut = new Date(start);
    oneWeekOut.setDate(start.getDate() + 7);
    const tomorrow = new Date(start);
    tomorrow.setDate(start.getDate() + 1);

    // Find holidays falling exactly 7 days from today (one nudge, not
    // a daily reminder for a week). Range is inclusive of the day's
    // 00:00–23:59.
    const horizonStart = new Date(oneWeekOut);
    const horizonEnd = new Date(oneWeekOut);
    horizonEnd.setHours(23, 59, 59, 999);

    const holidays = await this.prisma.holiday.findMany({
      where: { date: { gte: horizonStart, lte: horizonEnd } },
      select: { id: true, name: true, date: true },
    });
    if (holidays.length === 0) {
      this.log.log("holidays-upcoming: none in horizon");
      return;
    }

    const employees = await this.prisma.user.findMany({
      where: { status: "ACTIVE" },
      select: { id: true },
    });

    let fired = 0;
    for (const h of holidays) {
      // Skip if already broadcasted within the last 6 days.
      const yesterday = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      const recent = await this.prisma.notification.findFirst({
        where: {
          type: NotificationType.HOLIDAY_UPCOMING,
          title: { contains: h.name },
          createdAt: { gte: yesterday },
        },
        select: { id: true },
      });
      if (recent) continue;
      const dateStr = this.fmtDate(h.date);
      await Promise.all(
        employees.map((u) =>
          this.notifications.create(u.id, {
            type: NotificationType.HOLIDAY_UPCOMING,
            title: `Holiday next week: ${h.name}`,
            body: `${h.name} falls on ${dateStr}. Plan around it.`,
            link: `/holidays`,
          }).catch(() => undefined),
        ),
      );
      fired++;
    }
    this.log.log(`holidays-upcoming: broadcasted ${fired}`);
  }

  // ── 7. Work anniversaries (joinDate's month-day == today) ────────────────
  //
  // Skips year 0 (joined today is not an anniversary). 24h dedupe via
  // notification history so a duplicate cron run doesn't double-fire.
  // The user model has joinDate on EmployeeProfile only; we fan-out to
  // the whole team so colleagues get the heads-up too.

  private async workAnniversaries() {
    const today = new Date();
    const todayM = today.getMonth() + 1; // 1..12
    const todayD = today.getDate();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

    const employees = await this.prisma.employeeProfile.findMany({
      select: {
        joinDate: true,
        user: { select: { id: true, firstName: true, lastName: true, status: true } },
      },
    });
    const anniversaries = employees.filter((e) => {
      if (!e.joinDate || !e.user || e.user.status !== "ACTIVE") return false;
      const m = e.joinDate.getMonth() + 1;
      const d = e.joinDate.getDate();
      const years = today.getFullYear() - e.joinDate.getFullYear();
      return m === todayM && d === todayD && years >= 1;
    });
    if (anniversaries.length === 0) {
      this.log.log("work-anniversaries: none today");
      return;
    }

    const allActive = await this.prisma.user.findMany({
      where: { status: "ACTIVE" },
      select: { id: true },
    });
    let fired = 0;
    for (const a of anniversaries) {
      if (!a.user) continue;
      const years = today.getFullYear() - a.joinDate.getFullYear();
      const name = `${a.user.firstName ?? ""} ${a.user.lastName ?? ""}`.trim() || "A teammate";

      // Dedupe: skip if a notification for this person + year already
      // landed in the last 24h.
      const recent = await this.prisma.notification.findFirst({
        where: {
          title: { equals: `${years} ${years === 1 ? "year" : "years"} at the team: ${name}` },
          createdAt: { gte: yesterday },
        },
        select: { id: true },
      });
      if (recent) continue;

      await Promise.all(
        allActive.map((u) =>
          this.notifications.create(u.id, {
            type: NotificationType.GENERIC,
            title: `${years} ${years === 1 ? "year" : "years"} at the team: ${name}`,
            body: u.id === a.user!.id
              ? `Happy ${years}-year work anniversary 🎉`
              : `${name} is celebrating ${years} ${years === 1 ? "year" : "years"} with the team today.`,
            link: `/hr`,
          }).catch(() => undefined),
        ),
      );
      fired++;
    }
    this.log.log(`work-anniversaries: broadcasted ${fired}`);
  }

  // ── 8. Stale timers (running > 24h, user forgot to stop) ─────────────────
  //
  // Catches the "I clicked Start yesterday and went home" case. Notifies
  // only the timer's owner so they can stop it and salvage the entry.

  private async staleTimers() {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const running = await this.prisma.timeEntry.findMany({
      where: {
        endTime: null,
        startTime: { lt: dayAgo },
      },
      select: {
        id: true, startTime: true, userId: true,
        task: { select: { title: true } },
        project: { select: { name: true } },
      },
    });
    let fired = 0;
    for (const e of running) {
      // Dedupe so the same stuck timer doesn't bell every day forever.
      const recent = await this.prisma.notification.findFirst({
        where: {
          userId: e.userId,
          title: { startsWith: "Timer still running" },
          createdAt: { gte: yesterday },
        },
        select: { id: true },
      });
      if (recent) continue;
      const hours = Math.floor((Date.now() - e.startTime.getTime()) / (60 * 60 * 1000));
      await this.notifications.create(e.userId, {
        type: NotificationType.GENERIC,
        title: `Timer still running (${hours}h)`,
        body: `Your timer on ${e.task?.title ?? "an entry"}${e.project?.name ? ` (${e.project.name})` : ""} has been going for ${hours} hours. Stop it to log the time, or it'll keep accumulating.`,
        link: `/time`,
      }).catch(() => undefined);
      fired++;
    }
    this.log.log(`stale-timers: notified ${fired}`);
  }
}
