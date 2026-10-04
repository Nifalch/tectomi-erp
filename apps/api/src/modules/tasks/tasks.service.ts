import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ActivityAction, NotificationType, TaskStatus } from "@prisma/client";
import { MailService } from "../../common/mail/mail.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PaginationDto, getPagination } from "../../common/pagination/pagination.dto";
import { NotificationsService } from "../notifications/notifications.service";
import { TimeService } from "../time/time.service";
import { CreateTaskCommentDto, CreateTaskDto, UpdateTaskDto } from "./dto/create-task.dto";

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
    private readonly time: TimeService,
  ) {}

  /**
   * Compute rollup (estimatedHrs/progressPercent/childCount) from a task's
   * direct children. Returns null fields when there are no usable children.
   */
  private async computeRollup(taskId: string) {
    const children = await this.prisma.task.findMany({
      where: { parentId: taskId },
      select: { estimatedHrs: true, progressPercent: true, status: true },
    });
    const rolledEstimatedHrs =
      children.reduce((s, c) => s + Number(c.estimatedHrs ?? 0), 0) || null;
    const withHrs = children.filter((c) => Number(c.estimatedHrs ?? 0) > 0);
    const rolledProgress =
      withHrs.length > 0
        ? Math.round(
            withHrs.reduce(
              (s, c) => s + Number(c.progressPercent ?? 0) * Number(c.estimatedHrs ?? 0),
              0,
            ) / withHrs.reduce((s, c) => s + Number(c.estimatedHrs ?? 0), 0),
          )
        : children.length > 0
          ? Math.round(
              children.reduce((s, c) => s + Number(c.progressPercent ?? 0), 0) /
                children.length,
            )
          : null;
    return {
      estimatedHrs: rolledEstimatedHrs,
      progressPercent: rolledProgress,
      childCount: children.length,
    };
  }

  /**
   * Resolve the first @firstname.lastname / @firstname mention in a task
   * title to a user ID, scoped to the project's members. Returns null if
   * there's no match or the match is ambiguous.
   */
  private async resolveTitleMention(
    title: string,
    projectId: string,
  ): Promise<string | null> {
    if (!title || !projectId) return null;
    const match = /@([a-zA-Z][a-zA-Z0-9._-]+)/.exec(title);
    if (!match) return null;
    const raw = match[1].toLowerCase();
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        managerId: true,
        members: {
          select: {
            user: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!project) return null;
    const memberUsers = project.members.map((m) => m.user).filter(Boolean) as Array<{
      id: string;
      firstName: string | null;
      lastName: string | null;
    }>;
    // Also include manager so PMs can be mentioned.
    if (project.managerId && !memberUsers.some((u) => u.id === project.managerId)) {
      const mgr = await this.prisma.user.findUnique({
        where: { id: project.managerId },
        select: { id: true, firstName: true, lastName: true },
      });
      if (mgr) memberUsers.push(mgr);
    }

    // Priority 1: exact firstname.lastname match (unique)
    const fullMatches = memberUsers.filter((u) => {
      const key = `${(u.firstName ?? "").toLowerCase()}.${(u.lastName ?? "").toLowerCase()}`;
      return key === raw;
    });
    if (fullMatches.length === 1) return fullMatches[0].id;

    // Priority 2: firstname-only match (must be unique within the project)
    const firstOnlyMatches = memberUsers.filter(
      (u) => (u.firstName ?? "").toLowerCase() === raw,
    );
    if (firstOnlyMatches.length === 1) return firstOnlyMatches[0].id;

    return null;
  }

  /**
   * Parse all `@firstname.lastname` (or `@firstname`) mentions in a body
   * of text against the project's member roster + manager. Used to fire
   * TASK_MENTIONED on task descriptions, titles, and similar surfaces
   * (comments use a different bracket syntax handled separately).
   * Returns deduped userIds, excluding the actor so they don't notify
   * themselves.
   */
  private async resolveAllMentions(
    text: string,
    projectId: string,
    actorId?: string,
  ): Promise<string[]> {
    if (!text || !projectId) return [];
    const matches = Array.from(text.matchAll(/@([a-zA-Z][a-zA-Z0-9._-]+)/g));
    if (matches.length === 0) return [];
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        managerId: true,
        members: { select: { user: { select: { id: true, firstName: true, lastName: true } } } },
      },
    });
    if (!project) return [];
    const candidates = project.members.map((m) => m.user).filter(Boolean) as Array<{
      id: string; firstName: string | null; lastName: string | null;
    }>;
    if (project.managerId && !candidates.some((u) => u.id === project.managerId)) {
      const mgr = await this.prisma.user.findUnique({
        where: { id: project.managerId },
        select: { id: true, firstName: true, lastName: true },
      });
      if (mgr) candidates.push(mgr);
    }
    const ids = new Set<string>();
    for (const match of matches) {
      const raw = match[1].toLowerCase();
      const full = candidates.filter((u) => `${(u.firstName ?? "").toLowerCase()}.${(u.lastName ?? "").toLowerCase()}` === raw);
      if (full.length === 1) {
        ids.add(full[0].id);
        continue;
      }
      const firstOnly = candidates.filter((u) => (u.firstName ?? "").toLowerCase() === raw);
      if (firstOnly.length === 1) ids.add(firstOnly[0].id);
    }
    if (actorId) ids.delete(actorId);
    return Array.from(ids);
  }

  /** Fire-and-forget assignment email. Never breaks task flow on failure. */
  private async sendAssignmentEmail(params: {
    assigneeId: string;
    assignerId: string;
    taskId: string;
    taskTitle: string;
    projectName: string;
    dueDate: Date | null | undefined;
  }) {
    try {
      const [assignee, assigner] = await Promise.all([
        this.prisma.user.findUnique({
          where: { id: params.assigneeId },
          select: { email: true, firstName: true, lastName: true },
        }),
        this.prisma.user.findUnique({
          where: { id: params.assignerId },
          select: { firstName: true, lastName: true },
        }),
      ]);
      if (!assignee?.email) return;
      const assignerName = assigner
        ? `${assigner.firstName ?? ""} ${assigner.lastName ?? ""}`.trim() || "A teammate"
        : "A teammate";
      await this.mail.sendTemplateEmail(
        assignee.email,
        `You were assigned "${params.taskTitle}"`,
        {
          taskTitle: params.taskTitle,
          projectName: params.projectName,
          assignerName,
          dueDate: params.dueDate ? new Date(params.dueDate).toISOString() : "",
          taskUrl: `/tasks?openTask=${params.taskId}`,
        },
      );
    } catch (err) {
      console.warn("[tasks] failed to send assignment email:", err);
    }
  }

  /** Best-effort audit trail. Silently swallows errors so audits never break the user flow. */
  private async logActivity(
    userId: string,
    action: ActivityAction,
    task: { id: string; title: string },
    details?: string,
  ) {
    try {
      await this.prisma.activityLog.create({
        data: {
          userId,
          action,
          entityType: "task",
          entityId: task.id,
          entityName: task.title,
          details: details?.slice(0, 500),
        },
      });
    } catch {
      /* non-fatal */
    }
  }

  async getHistory(taskId: string) {
    return this.prisma.activityLog.findMany({
      where: { entityType: "task", entityId: taskId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  async findAll(query: PaginationDto & { rollup?: string | boolean; includeSubtasks?: string | boolean }, projectId?: string) {
    const { skip, take, page, pageSize } = getPagination(query);
    const where: Record<string, unknown> = {};
    if (query.search) where.title = { contains: query.search, mode: "insensitive" };
    if (projectId) where.projectId = projectId;
    // Project-scoped lists (kanban + list view) should only show
    // top-level tasks — subtasks belong under their parent. Opt-in
    // via ?includeSubtasks=true if a caller really wants them flat.
    const includeSubs = query.includeSubtasks === true || query.includeSubtasks === "true";
    if (!includeSubs) where.parentId = null;

    const [rawData, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        include: {
          // Only expose safe project fields on the task — never budget or client.
          project: { select: { id: true, name: true, status: true } },
          assignedTo: true,
          comments: { include: { author: true } },
          labels: { include: { label: true } },
          blockedBy: { include: { blocking: true } },
          milestone: { select: { id: true, title: true, status: true } },
          customStatus: { select: { id: true, name: true, color: true, category: true, sortOrder: true } },
        },
        skip,
        take,
        // Stable order for Kanban columns: sortOrder asc (for in-column position), then createdAt desc as a tie-breaker.
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      }),
      this.prisma.task.count({ where }),
    ]);

    // Rollup is opt-in via ?rollup=true because it adds one query per task.
    const wantRollup = query.rollup === true || query.rollup === "true";
    let data: unknown = rawData;
    if (wantRollup) {
      data = await Promise.all(
        rawData.map(async (t) => ({ ...t, rollup: await this.computeRollup(t.id) })),
      );
    }

    return {
      data,
      meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
    };
  }

  async findOne(id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true, status: true } },
        assignedTo: true,
        comments: {
          include: { author: true },
          orderBy: { createdAt: "asc" },
        },
        labels: { include: { label: true } },
        blockedBy: { include: { blocking: { select: { id: true, title: true, status: true } } } },
        blocking: { include: { blocked: { select: { id: true, title: true, status: true } } } },
        attachments: { include: { uploadedBy: true } },
        subtasks: {
          include: {
            assignedTo: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        parent: { select: { id: true, title: true, status: true } },
        milestone: { select: { id: true, title: true, status: true } },
        customStatus: { select: { id: true, name: true, color: true, category: true, sortOrder: true } },
      },
    });
    if (!task) throw new NotFoundException("Task not found.");
    const rollup = await this.computeRollup(id);
    return { ...task, rollup };
  }

  async findByAssignee(userId: string, query: PaginationDto, projectId?: string) {
    const { skip, take, page, pageSize } = getPagination(query);
    const where: Record<string, unknown> = { assignedToId: userId };
    if (query.search) where.title = { contains: query.search, mode: "insensitive" };
    if (projectId) where.projectId = projectId;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        include: {
          // Only expose safe project fields on the task — never budget or client.
          project: { select: { id: true, name: true, status: true } },
          assignedTo: true,
          comments: { include: { author: true } },
          labels: { include: { label: true } },
          blockedBy: { include: { blocking: true } },
          milestone: { select: { id: true, title: true, status: true } },
          customStatus: { select: { id: true, name: true, color: true, category: true, sortOrder: true } },
        },
        skip,
        take,
        // Stable order for Kanban columns: sortOrder asc (for in-column position), then createdAt desc as a tie-breaker.
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      }),
      this.prisma.task.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
    };
  }

  async create(dto: CreateTaskDto, createdById: string) {
    // Normalize empty strings → undefined so Prisma doesn't try to FK-link to "".
    const nullIfBlank = (v: string | null | undefined): string | undefined =>
      v === "" || v == null ? undefined : v;
    let assignedToId = nullIfBlank(dto.assignedToId);
    const sprintId = nullIfBlank(dto.sprintId);
    const parentId = nullIfBlank(dto.parentId);
    const milestoneId = nullIfBlank(dto.milestoneId);
    const customStatusId = nullIfBlank(dto.customStatusId);

    // When customStatusId is set, derive status from its category and verify project match.
    let resolvedStatus: TaskStatus | undefined = dto.status;
    if (customStatusId) {
      const cs = await this.prisma.projectTaskStatus.findUnique({ where: { id: customStatusId } });
      if (!cs) throw new BadRequestException("Custom status not found.");
      if (cs.projectId !== dto.projectId) {
        throw new BadRequestException("Custom status does not belong to this project.");
      }
      resolvedStatus = cs.category as unknown as TaskStatus;
    }

    // Auto-assign from the first @mention in the title when the caller
    // didn't explicitly pick an assignee.
    if (!assignedToId && dto.title) {
      const resolved = await this.resolveTitleMention(dto.title, dto.projectId);
      if (resolved) assignedToId = resolved;
    }

    const task = await this.prisma.task.create({
      data: {
        projectId: dto.projectId,
        title: dto.title,
        description: dto.description || undefined,
        assignedToId,
        status: resolvedStatus,
        customStatusId,
        priority: dto.priority,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        sprintId,
        milestoneId,
        parentId,
        storyPoints: dto.storyPoints ?? undefined,
        estimatedHrs: dto.estimatedHrs ?? undefined,
      },
      include: { project: { select: { id: true, name: true, status: true } } },
    });

    // Send notification to the assigned user
    if (assignedToId && assignedToId !== createdById) {
      await this.notifications.create(assignedToId, {
        type: NotificationType.TASK_ASSIGNED,
        title: `Assigned to you: ${task.title}`,
        body: `You've been assigned "${task.title}" in ${task.project.name}.`,
        link: `/tasks/${task.id}`,
        taskId: task.id,
        projectId: task.projectId,
      });
      await this.sendAssignmentEmail({
        assigneeId: assignedToId,
        assignerId: createdById,
        taskId: task.id,
        taskTitle: task.title,
        projectName: task.project.name,
        dueDate: task.dueDate,
      });
    }

    // Auto-subscribe assignee as a watcher
    if (assignedToId) {
      await this.addWatcherSafe(task.id, assignedToId);
    }

    // Fire TASK_MENTIONED for every @firstname.lastname mention in the
    // title or description. Excludes the assignee (they already got
    // TASK_ASSIGNED) so they don't double-bell.
    try {
      const mentionText = `${task.title ?? ""} ${dto.description ?? ""}`.trim();
      if (mentionText) {
        const mentioned = await this.resolveAllMentions(mentionText, task.projectId, createdById);
        await Promise.all(
          mentioned
            .filter((uid) => uid !== assignedToId)
            .map((uid) =>
              this.notifications.create(uid, {
                type: NotificationType.TASK_MENTIONED,
                title: `You were mentioned in ${task.title}`,
                body: `Mentioned on ${task.project.name}.`,
                link: `/tasks/${task.id}`,
                taskId: task.id,
                projectId: task.projectId,
              }).catch(() => undefined),
            ),
        );
      }
    } catch {
      /* non-fatal */
    }

    await this.logActivity(createdById, ActivityAction.CREATED, task);
    return task;
  }

  /** Idempotent watcher upsert. Safe to call repeatedly. */
  private async addWatcherSafe(taskId: string, userId: string): Promise<void> {
    try {
      await this.prisma.taskWatcher.upsert({
        where: { taskId_userId: { taskId, userId } },
        create: { taskId, userId },
        update: {},
      });
    } catch {
      /* non-fatal */
    }
  }

  async update(id: string, dto: UpdateTaskDto, updatedById: string) {
    // Grab old values for audit diff
    const oldTask = await this.prisma.task.findUnique({
      where: { id },
      select: {
        assignedToId: true, title: true, description: true, status: true, priority: true,
        sprintId: true, storyPoints: true, dueDate: true, projectId: true,
        customStatusId: true,
      },
    });

    // Only pass defined fields; convert dueDate string → Date (or null to clear).
    // Empty strings on FK fields ("" → null) mean "clear the relation".
    const data: Record<string, unknown> = {};
    const normalizeRelation = (v: unknown) => (v === "" ? null : v);
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.assignedToId !== undefined) data.assignedToId = normalizeRelation(dto.assignedToId);

    // Auto-assign from @mention when the title changes AND the caller
    // didn't explicitly set assignedToId. Never overwrites an explicit choice.
    if (
      dto.title !== undefined &&
      dto.assignedToId === undefined &&
      oldTask?.projectId
    ) {
      const resolved = await this.resolveTitleMention(dto.title, oldTask.projectId);
      if (resolved) data.assignedToId = resolved;
    }
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.sprintId !== undefined) data.sprintId = normalizeRelation(dto.sprintId);
    if (dto.milestoneId !== undefined) data.milestoneId = normalizeRelation(dto.milestoneId);
    if (dto.storyPoints !== undefined) data.storyPoints = dto.storyPoints;
    if (dto.estimatedHrs !== undefined) data.estimatedHrs = dto.estimatedHrs;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.isClientVisible !== undefined) data.isClientVisible = dto.isClientVisible;
    if (dto.customStatusId !== undefined) {
      const normalized = dto.customStatusId === "" || dto.customStatusId === null ? null : dto.customStatusId;
      data.customStatusId = normalized;
      if (normalized) {
        const cs = await this.prisma.projectTaskStatus.findUnique({ where: { id: normalized } });
        if (!cs) throw new BadRequestException("Custom status not found.");
        if (oldTask && cs.projectId !== oldTask.projectId) {
          throw new BadRequestException("Custom status does not belong to this project.");
        }
        // Category drives the coarse enum bucket.
        data.status = cs.category as unknown as TaskStatus;
      }
    }
    if (dto.startDate !== undefined) {
      data.startDate = dto.startDate === null || dto.startDate === "" ? null : new Date(dto.startDate);
    }
    if (dto.dueDate !== undefined) {
      data.dueDate = dto.dueDate === null || dto.dueDate === "" ? null : new Date(dto.dueDate);
    }

    // Dependency enforcement — if marking DONE, ensure all blockers are complete
    // (unless caller passes force=true on the DTO).
    if (dto.status === "DONE") {
      const blockers = await this.prisma.taskDependency.findMany({
        where: { blockedId: id },
        include: { blocking: { select: { id: true, title: true, status: true } } },
      });
      const unresolvedBlockers = blockers.filter((b) => b.blocking.status !== "DONE");
      if (unresolvedBlockers.length > 0 && !dto.force) {
        const titles = unresolvedBlockers.map((b) => `"${b.blocking.title}"`).join(", ");
        throw new BadRequestException(
          `Cannot mark as DONE — task is blocked by: ${titles}. Complete those first or use force=true.`,
        );
      }
    }

    // Progress % handling: clamp to [0,100]; if status is being set to DONE, force 100.
    if (dto.progressPercent !== undefined && dto.progressPercent !== null) {
      const clamped = Math.max(0, Math.min(100, Math.round(dto.progressPercent)));
      data.progressPercent = clamped;
    }
    if (dto.status === "DONE") {
      data.progressPercent = 100;
    }

    // If dueDate is being changed to a future date, reset reminderSentAt so a new
    // reminder can fire for the new deadline.
    if (dto.dueDate !== undefined) {
      data.reminderSentAt = null;
    }

    const task = await this.prisma.task.update({
      where: { id },
      data,
      include: { project: { select: { id: true, name: true, status: true } } },
    });

    // ── Auto-time-tracking on status transitions ────────────────────────
    // The employee never has to click Start/Stop — dragging a task to
    // "In Progress" begins a timer for the assignee; moving it out (Done,
    // Blocked, Review, anything else) stops it. Duration is capped to the
    // working window so overnight-left tasks don't read as 16h.
    // We attribute time to the ASSIGNEE, not the updater — admins moving
    // someone else's task shouldn't end up with hours on their own log.
    if (dto.status !== undefined && oldTask && oldTask.status !== task.status) {
      const targetUserId = (task as { assignedToId: string | null }).assignedToId ?? oldTask.assignedToId;
      if (targetUserId) {
        try {
          if (oldTask.status !== TaskStatus.IN_PROGRESS && task.status === TaskStatus.IN_PROGRESS) {
            await this.time.autoStartForTask(targetUserId, task.id);
          } else if (oldTask.status === TaskStatus.IN_PROGRESS && task.status !== TaskStatus.IN_PROGRESS) {
            await this.time.autoStopForTask(targetUserId, task.id);
          }
        } catch {
          // Time-tracking is best-effort; never block a status change because
          // the timer hook failed.
        }
      }
    }

    // Notify if assigned to a new person. Use the effective assignee on the
    // updated task so we also catch mention-resolved auto-assignments (which
    // bypass dto.assignedToId).
    const effectiveAssignee = (task as { assignedToId: string | null }).assignedToId;
    if (
      effectiveAssignee &&
      effectiveAssignee !== oldTask?.assignedToId &&
      effectiveAssignee !== updatedById
    ) {
      await this.notifications.create(effectiveAssignee, {
        type: NotificationType.TASK_ASSIGNED,
        title: `Assigned to you: ${task.title}`,
        body: `"${task.title}" in ${task.project.name} has been assigned to you.`,
        link: `/tasks/${task.id}`,
        taskId: task.id,
        projectId: task.projectId,
      });
      await this.sendAssignmentEmail({
        assigneeId: effectiveAssignee,
        assignerId: updatedById,
        taskId: task.id,
        taskTitle: task.title,
        projectName: task.project.name,
        dueDate: task.dueDate,
      });
    }

    // Notify if status changed to DONE
    if (dto.status === "DONE" && oldTask?.assignedToId && oldTask.assignedToId !== updatedById) {
      await this.notifications.create(oldTask.assignedToId, {
        type: NotificationType.GENERIC,
        title: "Task completed",
        body: `"${task.title}" has been marked as done.`,
        link: `/tasks/${task.id}`,
        taskId: task.id,
        projectId: task.projectId,
      });
    }

    // BLOCKED — work has stopped and the team needs to know. Goes to
    // the assignee + project manager so leadership can step in.
    if (
      dto.status === "BLOCKED" &&
      oldTask?.status !== "BLOCKED"
    ) {
      try {
        const recipients = new Set<string>();
        if (oldTask?.assignedToId && oldTask.assignedToId !== updatedById) recipients.add(oldTask.assignedToId);
        const project = await this.prisma.project.findUnique({
          where: { id: task.projectId },
          select: { managerId: true, name: true },
        });
        if (project?.managerId && project.managerId !== updatedById) recipients.add(project.managerId);
        await Promise.all(
          Array.from(recipients).map((uid) =>
            this.notifications.create(uid, {
              type: NotificationType.GENERIC,
              title: `Blocked: ${task.title}`,
              body: `Work on "${task.title}" is blocked${project?.name ? ` on ${project.name}` : ""}. Unblock it before the date slips.`,
              link: `/tasks/${task.id}`,
              taskId: task.id,
              projectId: task.projectId,
            }).catch(() => undefined),
          ),
        );
      } catch {
        /* non-fatal */
      }
    }

    // TASK_MENTIONED for any newly added @firstname.lastname in title or
    // description. Diff against the old text so we don't re-fire on
    // every edit. Excludes the assignee (already pinged via
    // TASK_ASSIGNED above when applicable).
    try {
      if (dto.title !== undefined || dto.description !== undefined) {
        const oldText = `${oldTask?.title ?? ""} ${(oldTask as { description?: string | null } | null)?.description ?? ""}`;
        const newText = `${task.title ?? ""} ${dto.description ?? ""}`.trim();
        if (newText) {
          const [oldMentions, newMentions] = await Promise.all([
            this.resolveAllMentions(oldText, task.projectId, updatedById),
            this.resolveAllMentions(newText, task.projectId, updatedById),
          ]);
          const oldSet = new Set(oldMentions);
          const fresh = newMentions.filter((uid) => !oldSet.has(uid));
          const effectiveAssignee = (task as { assignedToId: string | null }).assignedToId;
          await Promise.all(
            fresh
              .filter((uid) => uid !== effectiveAssignee)
              .map((uid) =>
                this.notifications.create(uid, {
                  type: NotificationType.TASK_MENTIONED,
                  title: `You were mentioned in ${task.title}`,
                  body: `Mentioned on ${task.project.name}.`,
                  link: `/tasks/${task.id}`,
                  taskId: task.id,
                  projectId: task.projectId,
                }).catch(() => undefined),
              ),
          );
        }
      }
    } catch {
      /* non-fatal */
    }

    // Audit diff — only capture the handful of fields that matter for history.
    if (oldTask) {
      const changes: string[] = [];
      const diff = (k: string, was: unknown, now: unknown) => {
        if (now !== undefined && JSON.stringify(was) !== JSON.stringify(now)) {
          changes.push(`${k}: ${JSON.stringify(was)} → ${JSON.stringify(now)}`);
        }
      };
      if (dto.title !== undefined) diff("title", oldTask.title, task.title);
      if (dto.status !== undefined) diff("status", oldTask.status, task.status);
      if (dto.priority !== undefined) diff("priority", oldTask.priority, task.priority);
      if (dto.assignedToId !== undefined) diff("assignee", oldTask.assignedToId, (task as any).assignedToId);
      if (dto.sprintId !== undefined) diff("sprint", oldTask.sprintId, (task as any).sprintId);
      if (dto.storyPoints !== undefined) diff("story points", oldTask.storyPoints, task.storyPoints);
      if (dto.dueDate !== undefined) diff("due date", oldTask.dueDate, task.dueDate);
      if (changes.length) {
        await this.logActivity(updatedById, ActivityAction.UPDATED, task, changes.join("; "));
      }

      // Auto-subscribe a newly assigned user as a watcher
      if (dto.assignedToId && dto.assignedToId !== "" && dto.assignedToId !== oldTask.assignedToId) {
        await this.addWatcherSafe(task.id, dto.assignedToId);
      }

      // Notify watchers (except the updater) about meaningful changes
      if (changes.length) {
        await this.notifyWatchers({
          taskId: task.id,
          taskTitle: task.title,
          updaterId: updatedById,
          diff: changes.join("; "),
        });
      }
    }

    return task;
  }

  /** Send an in-app notification to every watcher of a task, excluding the updater. */
  private async notifyWatchers(params: {
    taskId: string;
    taskTitle: string;
    updaterId: string;
    diff: string;
  }): Promise<void> {
    try {
      const watchers = await this.prisma.taskWatcher.findMany({
        where: { taskId: params.taskId, userId: { not: params.updaterId } },
        select: { userId: true },
      });
      if (!watchers.length) return;
      const updater = await this.prisma.user.findUnique({
        where: { id: params.updaterId },
        select: { firstName: true, lastName: true },
      });
      const updaterName = updater
        ? `${updater.firstName ?? ""} ${updater.lastName ?? ""}`.trim() || "Someone"
        : "Someone";
      const snippet = params.diff.length > 200 ? `${params.diff.slice(0, 200)}…` : params.diff;
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await Promise.all(
        watchers.map(async (w) => {
          // Dedupe: at most one TASK_WATCHER_ACTIVITY per watcher+task per 24h.
          const recent = await this.prisma.notification.count({
            where: {
              userId: w.userId,
              taskId: params.taskId,
              type: NotificationType.TASK_WATCHER_ACTIVITY,
              createdAt: { gte: since },
            },
          });
          if (recent > 0) return;
          await this.notifications.create(w.userId, {
            type: NotificationType.TASK_WATCHER_ACTIVITY,
            title: `${updaterName} updated ${params.taskTitle}`,
            body: snippet,
            link: `/tasks/${params.taskId}`,
            taskId: params.taskId,
          });
        }),
      );
    } catch {
      /* non-fatal */
    }
  }

  async addComment(taskId: string, authorId: string, dto: CreateTaskCommentDto) {
    const comment = await this.prisma.taskComment.create({
      data: {
        taskId,
        authorId,
        content: dto.content,
      },
    });

    // Notify the task assignee about the comment
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { assignedToId: true, title: true },
    });

    if (task?.assignedToId && task.assignedToId !== authorId) {
      await this.notifications.create(task.assignedToId, {
        type: NotificationType.TASK_COMMENT,
        title: "New comment on your task",
        body: `Someone commented on "${task.title}".`,
        link: `/tasks/${taskId}`,
        taskId,
      });
    }

    // Parse @[userId] or @[userId|name] mentions and notify each distinct user.
    if (task) {
      const mentionIds = new Set<string>();
      const re = /@\[([^|\]]+)(?:\|[^\]]+)?\]/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(dto.content)) !== null) {
        const uid = m[1].trim();
        if (uid && uid !== authorId) mentionIds.add(uid);
      }
      if (mentionIds.size > 0) {
        const ids = Array.from(mentionIds);
        const [mentioned, author] = await Promise.all([
          this.prisma.user.findMany({
            where: { id: { in: ids } },
            select: { id: true },
          }),
          this.prisma.user.findUnique({
            where: { id: authorId },
            select: { firstName: true, lastName: true },
          }),
        ]);
        const authorName = author
          ? `${author.firstName ?? ""} ${author.lastName ?? ""}`.trim() || "A teammate"
          : "A teammate";
        const snippet = dto.content.length > 120 ? `${dto.content.slice(0, 120)}…` : dto.content;
        await Promise.all(
          mentioned.map((u) =>
            this.notifications.create(u.id, {
              type: NotificationType.TASK_MENTIONED,
              title: `You were mentioned in ${task.title}`,
              body: `${authorName} mentioned you in "${task.title}": "${snippet}"`,
              link: `/tasks/${taskId}`,
              taskId,
            }),
          ),
        );
      }
    }

    // Auto-subscribe the commenter as a watcher
    await this.addWatcherSafe(taskId, authorId);

    return comment;
  }

  // ── Watchers ────────────────────────────────────────────────────────────
  async listWatchers(taskId: string) {
    const watchers = await this.prisma.taskWatcher.findMany({
      where: { taskId },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    return watchers.map((w) => w.user);
  }

  async watch(taskId: string, userId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId }, select: { id: true } });
    if (!task) throw new NotFoundException("Task not found.");
    await this.addWatcherSafe(taskId, userId);
    return { success: true };
  }

  async unwatch(taskId: string, userId: string) {
    try {
      await this.prisma.taskWatcher.delete({
        where: { taskId_userId: { taskId, userId } },
      });
    } catch {
      /* already gone — idempotent */
    }
    return { success: true };
  }

  // ── Due-soon reminders ──────────────────────────────────────────────────
  async runDueReminders() {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const due = await this.prisma.task.findMany({
      where: {
        dueDate: { not: null, lte: in24h, gt: now },
        status: { not: "DONE" },
        reminderSentAt: null,
        assignedToId: { not: null },
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        assignedToId: true,
        project: { select: { name: true } },
      },
    });

    let sent = 0;
    for (const t of due) {
      if (!t.assignedToId || !t.dueDate) continue;
      try {
        await this.notifications.create(t.assignedToId, {
          type: NotificationType.TASK_DUE_SOON,
          title: `Task due soon: ${t.title}`,
          body: `"${t.title}" is due on ${t.dueDate.toISOString()}.`,
          link: `/tasks/${t.id}`,
          taskId: t.id,
        });

        // Best-effort email — never break the reminder loop on mail failures.
        try {
          const assignee = await this.prisma.user.findUnique({
            where: { id: t.assignedToId },
            select: { email: true, firstName: true, lastName: true },
          });
          if (assignee?.email) {
            const assigneeName =
              `${assignee.firstName ?? ""} ${assignee.lastName ?? ""}`.trim() || "there";
            await this.mail.sendTemplateEmail(
              assignee.email,
              `Reminder: ${t.title} is due soon`,
              {
                taskTitle: t.title,
                projectName: t.project?.name ?? "",
                dueDate: t.dueDate.toISOString(),
                assigneeName,
                taskUrl: `/tasks?openTask=${t.id}`,
              },
            );
          }
        } catch (err) {
          console.warn("[tasks] failed to send reminder email:", err);
        }

        await this.prisma.task.update({
          where: { id: t.id },
          data: { reminderSentAt: new Date() },
        });
        sent += 1;
      } catch {
        /* skip individual failures */
      }
    }
    return { sent };
  }

  // ── Estimate vs actual ──────────────────────────────────────────────────
  async estimateVsActual(taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, estimatedHrs: true },
    });
    if (!task) throw new NotFoundException("Task not found.");

    const agg = await this.prisma.timeEntry.aggregate({
      where: { taskId },
      _sum: { duration: true },
    });
    const actualMinutes = agg._sum.duration ?? 0;
    const actualHrs = Math.round((actualMinutes / 60) * 100) / 100;
    const estimatedHrs = task.estimatedHrs ? Number(task.estimatedHrs) : 0;
    const variance = Math.round((actualHrs - estimatedHrs) * 100) / 100;
    const variancePercent = estimatedHrs > 0
      ? Math.round((variance / estimatedHrs) * 100)
      : null;

    return {
      estimatedHrs,
      actualMinutes,
      actualHrs,
      variance,
      variancePercent,
    };
  }

  async mentionableUsers(taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: {
        assignedToId: true,
        project: {
          select: {
            managerId: true,
            members: {
              select: {
                user: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
              },
            },
          },
        },
      },
    });
    if (!task) throw new NotFoundException("Task not found.");

    const ids = new Set<string>();
    const users: Array<{ id: string; firstName: string | null; lastName: string | null; email: string; avatarUrl: string | null }> = [];

    for (const m of task.project.members) {
      if (!ids.has(m.user.id)) {
        ids.add(m.user.id);
        users.push(m.user as any);
      }
    }
    // Always include project manager and task assignee even if not in members list.
    const extraIds: string[] = [];
    if (task.project.managerId && !ids.has(task.project.managerId)) extraIds.push(task.project.managerId);
    if (task.assignedToId && !ids.has(task.assignedToId)) extraIds.push(task.assignedToId);
    if (extraIds.length) {
      const extras = await this.prisma.user.findMany({
        where: { id: { in: extraIds } },
        select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
      });
      for (const u of extras) {
        if (!ids.has(u.id)) {
          ids.add(u.id);
          users.push(u);
        }
      }
    }
    return users;
  }

  async remove(id: string, actorId?: string) {
    const existing = await this.prisma.task.findUnique({
      where: { id },
      select: { id: true, title: true },
    });
    if (!existing) return { success: true, alreadyDeleted: true };

    await this.prisma.task.delete({ where: { id } });
    if (actorId) await this.logActivity(actorId, ActivityAction.DELETED, existing);
    return { success: true };
  }

  // ── Task clone (duplicate) ──────────────────────────────────────────────
  async clone(id: string, actorId: string) {
    const src = await this.prisma.task.findUnique({
      where: { id },
      include: { labels: true },
    });
    if (!src) throw new NotFoundException("Task not found.");

    const copy = await this.prisma.task.create({
      data: {
        projectId: src.projectId,
        title: `${src.title} (copy)`,
        description: src.description,
        assignedToId: src.assignedToId,
        status: "TODO",
        priority: src.priority,
        dueDate: src.dueDate,
        sprintId: src.sprintId,
        storyPoints: src.storyPoints,
        estimatedHrs: src.estimatedHrs,
        parentId: src.parentId,
        labels: {
          create: src.labels.map((l) => ({ labelId: l.labelId })),
        },
      },
      include: { project: { select: { id: true, name: true, status: true } } },
    });
    await this.logActivity(actorId, ActivityAction.CREATED, copy, `Cloned from "${src.title}"`);
    return copy;
  }

  // ── Comment edit / delete ───────────────────────────────────────────────
  async updateComment(commentId: string, authorId: string, content: string) {
    const existing = await this.prisma.taskComment.findUnique({ where: { id: commentId } });
    if (!existing) throw new NotFoundException("Comment not found.");
    if (existing.authorId !== authorId) {
      throw new NotFoundException("You can only edit your own comments.");
    }
    return this.prisma.taskComment.update({
      where: { id: commentId },
      data: { content },
      include: { author: true },
    });
  }

  async removeComment(commentId: string, authorId: string, isAdmin: boolean) {
    const existing = await this.prisma.taskComment.findUnique({ where: { id: commentId } });
    if (!existing) return { success: true, alreadyDeleted: true };
    if (existing.authorId !== authorId && !isAdmin) {
      throw new NotFoundException("You can only delete your own comments.");
    }
    await this.prisma.taskComment.delete({ where: { id: commentId } });
    return { success: true };
  }

  // ── Bulk ops ────────────────────────────────────────────────────────────
  async bulkUpdate(body: {
    ids: string[];
    status?: string;
    priority?: string;
    assignedToId?: string | null;
    sprintId?: string | null;
  }, actorId?: string) {
    if (!body.ids?.length) return { updated: 0 };
    const updates: Record<string, unknown> = {};
    if (body.status) updates.status = body.status;
    if (body.priority) updates.priority = body.priority;
    if (body.assignedToId !== undefined) updates.assignedToId = body.assignedToId || null;
    if (body.sprintId !== undefined) updates.sprintId = body.sprintId || null;

    if (!Object.keys(updates).length) return { updated: 0 };

    const res = await this.prisma.task.updateMany({
      where: { id: { in: body.ids } },
      data: updates,
    });

    // Cheap audit log — write one entry per task changed.
    if (actorId) {
      const affected = await this.prisma.task.findMany({
        where: { id: { in: body.ids } },
        select: { id: true, title: true },
      });
      const changes = Object.entries(updates).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join("; ");
      await Promise.all(
        affected.map((t) => this.logActivity(actorId, ActivityAction.UPDATED, t, `Bulk update — ${changes}`)),
      );
    }
    return { updated: res.count };
  }

  async bulkDelete(ids: string[], actorId?: string) {
    if (!ids?.length) return { deleted: 0 };
    const affected = await this.prisma.task.findMany({
      where: { id: { in: ids } },
      select: { id: true, title: true },
    });
    const res = await this.prisma.task.deleteMany({ where: { id: { in: ids } } });
    if (actorId) {
      await Promise.all(
        affected.map((t) => this.logActivity(actorId, ActivityAction.DELETED, t)),
      );
    }
    return { deleted: res.count };
  }

  async addDependency(blockedId: string, blockingId: string) {
    return this.prisma.taskDependency.create({
      data: { blockedId, blockingId },
      include: { blocking: true },
    });
  }

  async removeDependency(blockedId: string, blockingId: string) {
    return this.prisma.taskDependency.delete({
      where: { blockedId_blockingId: { blockedId, blockingId } },
    });
  }

  async addLabel(taskId: string, labelId: string) {
    return this.prisma.taskLabel.create({
      data: { taskId, labelId },
      include: { label: true },
    });
  }

  async removeLabel(taskId: string, labelId: string) {
    return this.prisma.taskLabel.delete({
      where: { taskId_labelId: { taskId, labelId } },
    });
  }

  // ── CSV export ──────────────────────────────────────────────────────────
  /** Return {csv, filename} — caller sets HTTP headers. */
  async exportCsv(projectId: string): Promise<{ csv: string; filename: string }> {
    if (!projectId) throw new BadRequestException("projectId is required.");

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true },
    });
    if (!project) throw new NotFoundException("Project not found.");

    const tasks = await this.prisma.task.findMany({
      where: { projectId },
      include: {
        assignedTo: { select: { firstName: true, lastName: true, email: true } },
        sprint: { select: { name: true } },
        milestone: { select: { title: true } },
        labels: { include: { label: { select: { name: true } } } },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });

    const escape = (v: unknown): string => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const headers = [
      "ID",
      "Title",
      "Status",
      "Priority",
      "Assignee",
      "Sprint",
      "Milestone",
      "Start Date",
      "Due Date",
      "Story Points",
      "Estimated Hours",
      "Progress %",
      "Created",
      "Updated",
      "Labels",
    ];

    const rows: string[] = [headers.map(escape).join(",")];
    for (const t of tasks) {
      const assigneeName = t.assignedTo
        ? `${t.assignedTo.firstName ?? ""} ${t.assignedTo.lastName ?? ""}`.trim() ||
          t.assignedTo.email
        : "";
      const labelNames = t.labels.map((l) => l.label?.name).filter(Boolean).join("; ");
      rows.push(
        [
          t.id,
          t.title,
          t.status,
          t.priority,
          assigneeName,
          t.sprint?.name ?? "",
          t.milestone?.title ?? "",
          t.startDate ? t.startDate.toISOString() : "",
          t.dueDate ? t.dueDate.toISOString() : "",
          t.storyPoints ?? "",
          t.estimatedHrs ? t.estimatedHrs.toString() : "",
          t.progressPercent ?? "",
          t.createdAt.toISOString(),
          t.updatedAt.toISOString(),
          labelNames,
        ]
          .map(escape)
          .join(","),
      );
    }

    const csv = rows.join("\r\n");
    const safeProjectName = project.name.replace(/[^a-z0-9-_]+/gi, "-");
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `tasks-${safeProjectName}-${dateStr}.csv`;
    return { csv, filename };
  }
}
