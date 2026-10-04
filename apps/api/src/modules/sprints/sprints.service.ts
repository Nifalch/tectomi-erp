import { Injectable, NotFoundException } from "@nestjs/common";
import { NotificationType } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";

interface CreateSprintInput {
  projectId: string;
  name: string;
  goal?: string;
  startDate: string;
  endDate: string;
  status?: string;
}

@Injectable()
export class SprintsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async findAll(projectId?: string) {
    const where = projectId ? { projectId } : {};
    return this.prisma.sprint.findMany({
      where,
      include: {
        _count: { select: { tasks: true } },
      },
      orderBy: { startDate: "desc" },
    });
  }

  async create(dto: CreateSprintInput) {
    return this.prisma.sprint.create({
      data: {
        projectId: dto.projectId,
        name: dto.name,
        goal: dto.goal,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        status: dto.status as any,
      },
    });
  }

  async update(id: string, dto: Partial<CreateSprintInput>) {
    const sprint = await this.prisma.sprint.findUnique({ where: { id } });
    if (!sprint) {
      throw new NotFoundException("Sprint not found.");
    }
    const updated = await this.prisma.sprint.update({
      where: { id },
      data: {
        name: dto.name,
        goal: dto.goal,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        status: dto.status as any,
      },
    });

    // SPRINT_STARTED — fire once when the status crosses into ACTIVE so
    // every assignee on the project sees "the new sprint just kicked
    // off". The enum existed but no caller was emitting it.
    if (sprint.status !== "ACTIVE" && updated.status === "ACTIVE") {
      try {
        const members = await this.prisma.projectMember.findMany({
          where: { projectId: updated.projectId },
          select: { userId: true },
        });
        const project = await this.prisma.project.findUnique({
          where: { id: updated.projectId },
          select: { managerId: true, name: true },
        });
        const recipients = new Set<string>(members.map((m) => m.userId));
        if (project?.managerId) recipients.add(project.managerId);
        await Promise.all(
          Array.from(recipients).map((uid) =>
            this.notifications.create(uid, {
              type: NotificationType.SPRINT_STARTED,
              title: `Sprint started: ${updated.name}`,
              body: project?.name
                ? `New sprint kicked off on ${project.name}${updated.goal ? ` — ${updated.goal}` : ""}.`
                : updated.goal ?? "A new sprint just started.",
              link: `/projects/${updated.projectId}`,
              projectId: updated.projectId,
            }).catch(() => undefined),
          ),
        );
      } catch {
        /* non-fatal */
      }
    }
    return updated;
  }

  async remove(id: string) {
    return this.prisma.sprint.delete({ where: { id } });
  }

  // ── Burndown ───────────────────────────────────────────────────────────

  private async computeCurrentTotals(sprintId: string) {
    const tasks = await this.prisma.task.findMany({
      where: { sprintId },
      select: { status: true, storyPoints: true },
    });
    let pointsCompleted = 0;
    let pointsRemaining = 0;
    let tasksCompleted = 0;
    let tasksRemaining = 0;
    for (const t of tasks) {
      const pts = t.storyPoints ?? 0;
      if (t.status === "DONE") {
        pointsCompleted += pts;
        tasksCompleted += 1;
      } else {
        pointsRemaining += pts;
        tasksRemaining += 1;
      }
    }
    return { pointsCompleted, pointsRemaining, tasksCompleted, tasksRemaining };
  }

  async captureSnapshot(sprintId: string) {
    const sprint = await this.prisma.sprint.findUnique({ where: { id: sprintId } });
    if (!sprint) throw new NotFoundException("Sprint not found.");
    const totals = await this.computeCurrentTotals(sprintId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return this.prisma.sprintBurndownSnapshot.upsert({
      where: { sprintId_date: { sprintId, date: today } },
      create: { sprintId, date: today, ...totals },
      update: totals,
    });
  }

  async getBurndown(sprintId: string) {
    const sprint = await this.prisma.sprint.findUnique({ where: { id: sprintId } });
    if (!sprint) throw new NotFoundException("Sprint not found.");

    // Auto-capture today's snapshot for ACTIVE sprints every time someone
    // loads the burndown. Upsert is idempotent (keyed by sprintId+date), so
    // repeat views within a day just overwrite with the latest totals. This
    // removes the need for a cron job or manual "Take snapshot" button.
    if (sprint.status === "ACTIVE") {
      try {
        await this.captureSnapshot(sprintId);
      } catch {
        // Best-effort — never block the burndown fetch on snapshot failure.
      }
    }

    const snapshots = await this.prisma.sprintBurndownSnapshot.findMany({
      where: { sprintId },
      orderBy: { date: "asc" },
      select: {
        date: true,
        pointsCompleted: true,
        pointsRemaining: true,
        tasksCompleted: true,
        tasksRemaining: true,
      },
    });

    // Build the ideal line: straight line from total points on startDate → 0 on endDate.
    const start = new Date(sprint.startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(sprint.endDate);
    end.setHours(0, 0, 0, 0);

    // Compute total points in the sprint (completed + remaining right now).
    const currentTotals = await this.computeCurrentTotals(sprintId);
    const totalPoints = currentTotals.pointsCompleted + currentTotals.pointsRemaining;

    const msPerDay = 86_400_000;
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / msPerDay));
    const ideal: { date: Date; points: number }[] = [];
    for (let i = 0; i <= days; i++) {
      const d = new Date(start.getTime() + i * msPerDay);
      const points = Math.max(0, totalPoints - (totalPoints * i) / days);
      ideal.push({ date: d, points: Math.round(points * 100) / 100 });
    }

    return { sprint, snapshots, ideal };
  }

  // ── Project velocity ────────────────────────────────────────────────────
  async getProjectVelocity(projectId: string) {
    const sprints = await this.prisma.sprint.findMany({
      where: { projectId, status: { in: ["ACTIVE", "COMPLETED"] } },
      orderBy: { startDate: "asc" },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        status: true,
      },
    });

    const results = await Promise.all(
      sprints.map(async (s) => {
        const tasks = await this.prisma.task.findMany({
          where: { sprintId: s.id },
          select: { status: true, storyPoints: true },
        });
        let plannedPoints = 0;
        let completedPoints = 0;
        let taskCount = 0;
        let completedTaskCount = 0;
        for (const t of tasks) {
          const pts = t.storyPoints ?? 0;
          plannedPoints += pts;
          taskCount += 1;
          if (t.status === "DONE") {
            completedPoints += pts;
            completedTaskCount += 1;
          }
        }
        return {
          sprintId: s.id,
          name: s.name,
          startDate: s.startDate,
          endDate: s.endDate,
          status: s.status,
          plannedPoints,
          completedPoints,
          taskCount,
          completedTaskCount,
        };
      }),
    );

    const completed = results.filter((r) => r.status === "COMPLETED");
    const averageVelocity =
      completed.length > 0
        ? completed.reduce((sum, r) => sum + r.completedPoints, 0) / completed.length
        : 0;

    return {
      sprints: results,
      averageVelocity: Math.round(averageVelocity * 100) / 100,
      completedSprintCount: completed.length,
    };
  }
}
