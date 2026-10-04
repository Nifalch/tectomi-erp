import { ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ActivityAction, InvoiceStatus, NotificationType, PaymentMilestoneStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { MailService } from "../../common/mail/mail.service";
import { env } from "../../config/env";
import { PaginationDto, getPagination } from "../../common/pagination/pagination.dto";
import { ChatService } from "../chat/chat.service";
import { NotificationsService } from "../notifications/notifications.service";
import { AiService } from "../ai/ai.service";
import { CreateProjectDto } from "./dto/create-project.dto";

/**
 * Fallback hours assumed for an active task that doesn't have an
 * `estimatedHrs` set — used by capacity / utilization calculations so
 * the dashboard reflects real workload even when the team isn't filling
 * in estimates on every ticket. Roughly "half a working day per task,"
 * which empirically lines up better with how services-agency tickets
 * actually shake out than counting them as zero.
 *
 * If we ever surface this as a config knob it should live on
 * `AttendancePolicy` or a new `WorkspaceSettings` row.
 */
const DEFAULT_TASK_ESTIMATED_HOURS = 4;

function effectiveTaskHours(estimatedHrs: Prisma.Decimal | number | null | undefined): number {
  const v = Number(estimatedHrs ?? 0);
  return v > 0 ? v : DEFAULT_TASK_ESTIMATED_HOURS;
}

interface CloneProjectDto {
  name: string;
  cloneMembers?: boolean;
  cloneStatuses?: boolean;
  cloneLabels?: boolean;
  cloneRecurring?: boolean;
  cloneMilestones?: boolean;
}

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chat: ChatService,
    private readonly notifications: NotificationsService,
    private readonly ai: AiService,
    private readonly mail: MailService,
  ) {}

  /**
   * Heuristic — does this string look like a polished consultant paragraph
   * we can ship to a client? Returns false for raw user scribbles like
   * "basic shopify store", "fix the checkout pls", "asap", etc.
   *
   * Rules: at least 60 chars, contains at least one sentence-ending
   * punctuation mark, and at least two words start with a capital letter
   * (so a paragraph that starts with a proper noun and a "We will…"
   * passes; an all-lowercase fragment fails).
   */
  private looksProfessional(text: string | null | undefined): boolean {
    if (!text) return false;
    const trimmed = text.trim();
    if (trimmed.length < 60) return false;
    if (!/[.!?]/.test(trimmed)) return false;
    const capitalisedWords = trimmed.match(/(^|\s)[A-Z][a-z]/g) ?? [];
    return capitalisedWords.length >= 2;
  }

  /**
   * Build a polished, brand-consistent fallback for the proposal cover
   * paragraphs when the AI copy step fails / is unavailable / returns
   * thin output. Critically, this NEVER references the raw user brief —
   * dumping the customer's typo-laden scribble straight into the
   * Executive Summary is exactly what makes the proposal look amateur.
   * Instead we synthesize prose from the structured plan metadata.
   */
  private buildProposalFallbackCopy(args: {
    projectName: string;
    clientName?: string;
    milestoneTitles: string[];
    deliverableCount: number;
    totalHours: number;
    totalWeeks: number;
    formattedBudget: string;
    formattedRate: string;
  }): { description: string; projectUnderstanding: string } {
    const {
      projectName,
      clientName,
      milestoneTitles,
      deliverableCount,
      totalHours,
      totalWeeks,
      formattedBudget,
      formattedRate,
    } = args;

    const clientLabel = clientName?.trim() ? clientName.trim() : "the client";
    const milestonesPreview = milestoneTitles.slice(0, 3).join(", ");
    const milestoneFooter =
      milestoneTitles.length > 3 ? `, and ${milestoneTitles.length - 3} more` : "";
    const durationFragment =
      totalWeeks > 0
        ? `${totalWeeks} ${totalWeeks === 1 ? "week" : "weeks"} of focused delivery`
        : "a phased delivery";
    const hoursFragment = totalHours > 0 ? `${Math.round(totalHours)} engineering hours` : "scoped engineering hours";

    const description =
      `${projectName} is delivered for ${clientLabel} in ${durationFragment} across ${milestoneTitles.length || "multiple"} milestones — ` +
      `${milestonesPreview || "audit, build, and launch"}${milestoneFooter}. ` +
      `Each milestone closes with a written sign-off and a working demo, so progress is visible at every stage. ` +
      `At launch the team hands over a production-ready system, documented and ready for the client's team to operate.`;

    const projectUnderstanding =
      `${clientLabel} is investing ${formattedBudget} (${hoursFragment} at ${formattedRate}) to bring this engagement into production. ` +
      `The scope is fixed at signature and decomposed into ${milestoneTitles.length || "a small number of"} milestones with clear acceptance criteria, ` +
      `so the team can deliver in independently reviewable steps rather than as one opaque hand-off. ` +
      `${deliverableCount > 0 ? `${deliverableCount} concrete deliverables are listed in the Scope of Work, ` : ""}` +
      `each tied to an outcome the client can verify before paying the next milestone.`;

    return { description, projectUnderstanding };
  }

  /** Fire PROJECT_MEMBER_ADDED to each userId in the list, skipping the actor. */
  private async notifyMembersAdded(
    project: { id: string; name: string },
    userIds: Array<string | null | undefined>,
    actorId?: string,
  ) {
    const unique = Array.from(new Set(userIds.filter((u): u is string => !!u)));
    await Promise.all(
      unique
        .filter((uid) => uid !== actorId)
        .map(async (uid) => {
          try {
            await this.notifications.create(uid, {
              type: NotificationType.PROJECT_MEMBER_ADDED,
              title: `Added to project: ${project.name}`,
              link: `/projects/${project.id}`,
              projectId: project.id,
            });
          } catch {
            /* non-fatal */
          }
        }),
    );
  }

  /**
   * Restrict project visibility for non-admins: an employee only sees projects
   * they manage, are a member of, or have at least one assigned task in.
   */
  private buildAccessWhere(userId?: string, restrictToMember = false): Record<string, unknown> {
    if (!restrictToMember || !userId) return {};
    return {
      OR: [
        { managerId: userId },
        { members: { some: { userId } } },
        { tasks: { some: { assignedToId: userId } } },
      ],
    };
  }

  async findAll(query: PaginationDto, opts?: { userId?: string; restrict?: boolean }) {
    const { skip, take, page, pageSize } = getPagination(query);
    const access = this.buildAccessWhere(opts?.userId, opts?.restrict);
    const where: Record<string, unknown> = {
      ...(query.search ? { name: { contains: query.search, mode: "insensitive" as const } } : {}),
      ...access,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        include: {
          client: true,
          manager: true,
          members: { include: { user: true } },
          milestones: true,
        },
        skip,
        take,
        orderBy: { updatedAt: "desc" },
      }),
      this.prisma.project.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
    };
  }

  /** Returns true if the user has access to the project (admin or member-like). */
  async userHasProjectAccess(projectId: string, userId: string): Promise<boolean> {
    const hit = await this.prisma.project.count({
      where: {
        id: projectId,
        OR: [
          { managerId: userId },
          { members: { some: { userId } } },
          { tasks: { some: { assignedToId: userId } } },
        ],
      },
    });
    return hit > 0;
  }

  async create(dto: CreateProjectDto & { hourlyRate?: number }, actorId?: string) {
    const project = await this.prisma.project.create({
      data: {
        name: dto.name,
        clientId: dto.clientId,
        description: dto.description,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        budget: dto.budget,
        // Per-project rate override. Skipped when undefined so existing
        // manual-create flows that don't pass it behave exactly as before.
        hourlyRate:
          typeof dto.hourlyRate === "number" && dto.hourlyRate > 0
            ? new Prisma.Decimal(dto.hourlyRate)
            : undefined,
        status: dto.status,
        managerId: dto.managerId,
        members: dto.memberIds?.length
          ? {
              create: dto.memberIds.map((userId) => ({
                userId,
                roleLabel: "Contributor",
                allocation: 40,
              })),
            }
          : undefined,
      },
      include: {
        client: true,
        manager: true,
        members: true,
      },
    });
    // Create matching PROJECT channel (non-fatal if it fails).
    try {
      await this.chat.ensureProjectChannel(project.id);
    } catch {
      /* non-fatal */
    }
    // Auto-seed default 50/30/20 payment schedule (non-fatal if it fails).
    try {
      await this.prisma.projectPaymentMilestone.createMany({
        data: [
          { projectId: project.id, label: "Advance", percentage: new Prisma.Decimal(50), sortOrder: 0 },
          { projectId: project.id, label: "Mid-project", percentage: new Prisma.Decimal(30), sortOrder: 1 },
          { projectId: project.id, label: "Final", percentage: new Prisma.Decimal(20), sortOrder: 2 },
        ],
      });
    } catch {
      /* non-fatal */
    }
    // Fire PROJECT_MEMBER_ADDED to each added member + the manager (unless actor).
    await this.notifyMembersAdded(
      { id: project.id, name: project.name },
      [...(dto.memberIds ?? []), dto.managerId],
      actorId,
    );

    // PROJECT_ADDED — fan out to admins/CEO so leadership sees new
    // projects appearing in the org without having to refresh /projects.
    // Members + manager already got PROJECT_MEMBER_ADDED above, so they
    // are excluded here to avoid a duplicate bell.
    try {
      const admins = await this.prisma.user.findMany({
        where: {
          status: "ACTIVE",
          roles: { some: { role: { code: { in: ["SUPER_ADMIN", "ADMIN"] } } } },
        },
        select: { id: true },
      });
      const excluded = new Set<string>([
        ...(dto.memberIds ?? []),
        dto.managerId,
        ...(actorId ? [actorId] : []),
      ]);
      await Promise.all(
        admins
          .filter((u) => !excluded.has(u.id))
          .map((u) =>
            this.notifications.create(u.id, {
              type: NotificationType.PROJECT_ADDED,
              title: `New project: ${project.name}`,
              body: project.client?.companyName
                ? `For ${project.client.companyName}.`
                : "A new project was just created.",
              link: `/projects/${project.id}`,
              projectId: project.id,
            }).catch(() => undefined),
          ),
      );
    } catch {
      /* non-fatal */
    }
    return project;
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        client: true,
        manager: true,
        members: { include: { user: true } },
        milestones: true,
        tasks: true,
        resourceAllocations: { include: { user: true } },
        documents: true,
        invoices: true,
      },
    });

    if (!project) {
      throw new NotFoundException("Project not found.");
    }

    return project;
  }

  async update(id: string, dto: Partial<CreateProjectDto>, actorId?: string) {
    const { memberIds, startDate, endDate, ...rest } = dto as Partial<CreateProjectDto> & { memberIds?: string[] };

    // Snapshot the previous status so we can detect transitions to
    // COMPLETED / CANCELLED and notify management.
    const prevSnapshot = await this.prisma.project.findUnique({
      where: { id },
      select: { status: true, name: true },
    });

    // Track newly-added members so we can fire PROJECT_MEMBER_ADDED afterwards.
    let newlyAddedMemberIds: string[] = [];

    // If memberIds is provided, replace the project's membership roster.
    if (Array.isArray(memberIds)) {
      const existing = await this.prisma.projectMember.findMany({
        where: { projectId: id },
        select: { userId: true },
      });
      const existingIds = new Set(existing.map((m) => m.userId));
      newlyAddedMemberIds = memberIds.filter((uid) => !existingIds.has(uid));
      await this.prisma.$transaction([
        this.prisma.projectMember.deleteMany({ where: { projectId: id } }),
        ...(memberIds.length
          ? [
              this.prisma.projectMember.createMany({
                data: memberIds.map((userId) => ({
                  projectId: id,
                  userId,
                  roleLabel: "Contributor",
                  allocation: 40,
                })),
                skipDuplicates: true,
              }),
            ]
          : []),
      ]);
    }

    const updated = await this.prisma.project.update({
      where: { id },
      data: {
        ...rest,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      },
      include: {
        client: true,
        manager: true,
        members: { include: { user: true } },
        milestones: true,
      },
    });
    // Sync project channel membership if the roster or manager changed.
    try {
      await this.chat.syncProjectChannelMembers(id);
    } catch {
      /* non-fatal */
    }
    if (newlyAddedMemberIds.length) {
      await this.notifyMembersAdded(
        { id: updated.id, name: updated.name },
        newlyAddedMemberIds,
        actorId,
      );
    }

    // Project lifecycle notifications — fire when status crosses into
    // COMPLETED / CANCELLED / ON_HOLD. Recipients: project manager +
    // admins/CEO (so leadership sees milestone-of-leadership without
    // bell-poking).
    if (prevSnapshot && prevSnapshot.status !== updated.status &&
        (updated.status === "COMPLETED" || updated.status === "CANCELLED" || updated.status === "ON_HOLD")) {
      try {
        const recipients = await this.findLeadershipRecipients(updated.managerId, actorId);
        const meta = {
          COMPLETED: {
            verb: "completed",
            body: "All milestones wrapped. Time to invoice the final stage and close the project.",
          },
          CANCELLED: {
            verb: "cancelled",
            body: "Project moved to cancelled. Review remaining work + outstanding balance.",
          },
          ON_HOLD: {
            verb: "on hold",
            body: "Project paused. Capture the reason in the description so the team isn't guessing on restart.",
          },
        }[updated.status as "COMPLETED" | "CANCELLED" | "ON_HOLD"];
        await Promise.all(
          recipients.map((uid) =>
            this.notifications.create(uid, {
              type: NotificationType.GENERIC,
              title: `Project ${meta.verb}: ${updated.name}`,
              body: meta.body,
              link: `/projects/${updated.id}`,
              projectId: updated.id,
            }).catch(() => undefined),
          ),
        );
      } catch {
        /* non-fatal */
      }

      // Client-facing project handoff email. Only fires for COMPLETED —
      // CANCELLED / ON_HOLD are typically delicate conversations that
      // belong on a call, not a templated email blast.
      if (updated.status === "COMPLETED") {
        await this.dispatchProjectCompletedEmail(updated.id);
      }
    }
    return updated;
  }

  /**
   * Branded "your project is complete" email to the client's active
   * portal contacts. Falls back to `client.email` if no portal contacts
   * exist. Best-effort: failures are swallowed so the status transition
   * itself isn't blocked by a flaky SMTP server.
   */
  private async dispatchProjectCompletedEmail(projectId: string): Promise<void> {
    try {
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        include: {
          client: { include: { clientContacts: { where: { status: "ACTIVE" } } } },
          manager: { select: { firstName: true, lastName: true, email: true } },
        },
      });
      if (!project) return;

      const recipients = new Set<string>();
      for (const c of project.client.clientContacts) {
        if (c.email) recipients.add(c.email);
      }
      if (recipients.size === 0 && project.client.email) {
        recipients.add(project.client.email);
      }
      if (recipients.size === 0) {
        this.logger.warn(`No client recipients for completed project ${projectId} — skipping email.`);
        return;
      }

      const managerName = project.manager
        ? `${project.manager.firstName} ${project.manager.lastName}`.trim() || null
        : null;
      const firstContact = project.client.clientContacts[0];
      const portalUrl = `${env.portalUrl.replace(/\/$/, "")}/portal/projects/${project.id}`;
      const completedOn = new Date().toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });

      // Duration label: round to whole weeks when project has start/end
      // dates, falling back to "—" when one side is missing. Keeps the
      // stat strip honest (no fake durations) without dropping the stat
      // entirely.
      const duration = computeDurationLabel(project.startDate, project.endDate);

      await Promise.all(
        Array.from(recipients).map((to) =>
          this.mail.sendProjectCompleteEmail(to, {
            recipientName: firstContact?.name ?? null,
            clientName: project.client.companyName,
            projectName: project.name,
            completedOn,
            duration,
            projectLead: managerName,
            projectLeadEmail: project.manager?.email ?? null,
            portalUrl,
          }).catch((err) => this.logger.warn(`Project-complete mail to ${to} failed: ${(err as Error).message}`)),
        ),
      );
    } catch (err) {
      this.logger.warn(`dispatchProjectCompletedEmail(${projectId}) failed: ${(err as Error).message}`);
    }
  }

  /**
   * Look up the people who should hear about project-lifecycle events
   * (start / completion / cancellation). Project manager + active admins
   * and super-admins. Excludes the actor so they don't get pinged about
   * their own action.
   */
  private async findLeadershipRecipients(managerId: string | null, actorId?: string): Promise<string[]> {
    const admins = await this.prisma.user.findMany({
      where: {
        status: "ACTIVE",
        roles: { some: { role: { code: { in: ["SUPER_ADMIN", "ADMIN"] } } } },
      },
      select: { id: true },
    });
    const ids = new Set<string>(admins.map((u) => u.id));
    if (managerId) ids.add(managerId);
    if (actorId) ids.delete(actorId);
    return Array.from(ids);
  }

  async remove(id: string) {
    // Idempotent: if the project was already deleted or never existed,
    // respond with a clean 200 instead of a Prisma P2025 → 500.
    const existing = await this.prisma.project.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) return { success: true, alreadyDeleted: true };

    // Explicitly clean up relations that aren't cascade-deleted or that
    // could otherwise block deletion (Contract, Invoices, etc. restrict).
    await this.prisma.$transaction([
      this.prisma.projectMember.deleteMany({ where: { projectId: id } }),
      this.prisma.resourceAllocation.deleteMany({ where: { projectId: id } }),
      this.prisma.milestone.deleteMany({ where: { projectId: id } }),
      // Reset sprintId/projectId on records that reference the project but
      // we don't want to hard-delete.
      this.prisma.timeEntry.deleteMany({ where: { projectId: id } }),
      this.prisma.invoice.updateMany({ where: { projectId: id }, data: { projectId: null } }),
      this.prisma.proposal.updateMany({ where: { projectId: id }, data: { projectId: null } }),
      this.prisma.document.updateMany({ where: { projectId: id }, data: { projectId: null } }),
    ]);

    await this.prisma.project.delete({ where: { id } });
    return { success: true };
  }

  /**
   * ClickUp-style "Box" view. For every member of a project, return their task
   * counts (done / not-done), completion %, time-estimate totals, actual logged
   * time, and the tasks themselves grouped by status.
   */
  async workload(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        members: { include: { user: true } },
        manager: true,
        tasks: {
          include: {
            assignedTo: true,
            timeEntries: { select: { duration: true } },
          },
          orderBy: { updatedAt: "desc" },
        },
      },
    });
    if (!project) throw new NotFoundException("Project not found.");

    // Project-duration capacity. Comparing all-tasks vs ONE week of
    // capacity made everyone look 200-300% over even when the project
    // has 6+ weeks to spread the work. Instead, compute how many weeks
    // the project actually runs and multiply capacity by that. If no
    // end date is set, assume 6 weeks (typical Nuro 7 engagement).
    const ms = 24 * 60 * 60 * 1000;
    const projectStart = project.startDate ? new Date(project.startDate).getTime() : Date.now();
    const projectEnd = project.endDate ? new Date(project.endDate).getTime() : projectStart + 6 * 7 * ms;
    const projectWeeks = Math.max(1, Math.ceil((projectEnd - projectStart) / (7 * ms)));

    // Build a unique list of people to show: project manager + all members + anyone assigned to a task
    const peopleMap = new Map<string, { id: string; firstName: string; lastName: string; email: string; avatarUrl?: string | null }>();
    const addPerson = (u: { id: string; firstName: string; lastName: string; email: string; avatarUrl?: string | null } | null | undefined) => {
      if (u?.id && !peopleMap.has(u.id)) peopleMap.set(u.id, u);
    };
    addPerson(project.manager);
    for (const m of project.members) addPerson(m.user as any);
    for (const t of project.tasks) addPerson(t.assignedTo as any);

    const STATUSES_ACTIVE = ["BACKLOG", "TODO", "IN_PROGRESS", "REVIEW", "BLOCKED"] as const;

    // Pull weekly capacity from EmployeeProfile for every person in this view
    const personIds = [...peopleMap.keys()];
    const profiles = personIds.length
      ? await this.prisma.employeeProfile.findMany({
          where: { userId: { in: personIds } },
          select: { userId: true, weeklyCapacityHrs: true },
        })
      : [];
    const capacityByUser = new Map<string, number>();
    for (const p of profiles) {
      capacityByUser.set(p.userId, Number(p.weeklyCapacityHrs ?? 40));
    }

    const boxes = [...peopleMap.values()].map((user) => {
      const theirTasks = project.tasks.filter((t) => t.assignedToId === user.id);
      const done = theirTasks.filter((t) => t.status === "DONE");
      const notDone = theirTasks.filter((t) => t.status !== "DONE");

      // time estimate in minutes (estimatedHrs stored as decimal hours → minutes)
      const estMinutes = (hrs: any) => Math.round(Number(hrs ?? 0) * 60);
      const estNotDone = notDone.reduce((s, t) => s + estMinutes(t.estimatedHrs), 0);
      const estDone = done.reduce((s, t) => s + estMinutes(t.estimatedHrs), 0);
      const loggedMinutes = theirTasks
        .flatMap((t) => t.timeEntries)
        .reduce((s, e) => s + (e.duration ?? 0), 0);
      const tasksWithoutEstimate = theirTasks.filter((t) => !t.estimatedHrs || Number(t.estimatedHrs) === 0).length;

      const percentDone = theirTasks.length
        ? Math.round((done.length / theirTasks.length) * 100)
        : 0;

      const byStatus: Record<string, Array<{ id: string; title: string; status: string; priority: string; estimatedHrs: number | null; dueDate: string | null }>> = {};
      for (const s of STATUSES_ACTIVE) byStatus[s] = [];
      byStatus["DONE"] = [];
      for (const t of theirTasks) {
        byStatus[t.status].push({
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          estimatedHrs: t.estimatedHrs ? Number(t.estimatedHrs) : null,
          dueDate: t.dueDate ? t.dueDate.toISOString() : null,
        });
      }

      // Capacity planning — sum of estimatedHrs on active (non-DONE) tasks in this project.
      // Tasks without an estimate use DEFAULT_TASK_ESTIMATED_HOURS so utilization isn't
      // zero just because nobody filled in estimates.
      const weeklyHours = capacityByUser.get(user.id) ?? 40;
      const committedHours = Math.round(
        notDone.reduce((s, t) => s + effectiveTaskHours(t.estimatedHrs), 0) * 100,
      ) / 100;
      // Total available hours = weekly capacity × project duration in
      // weeks. A 6-week project with 40h/week gives 240h to spend per
      // person. 124h of committed work against 240h = 52%, not 310%.
      const availableHours = weeklyHours * projectWeeks;
      const percentUsed = availableHours > 0
        ? Math.round((committedHours / availableHours) * 100)
        : 0;

      return {
        user,
        totals: {
          tasks: theirTasks.length,
          done: done.length,
          notDone: notDone.length,
          percentDone,
          estimatedMinutesNotDone: estNotDone,
          estimatedMinutesDone: estDone,
          loggedMinutes,
          tasksWithoutEstimate,
        },
        capacity: {
          weeklyHours,
          // Surface the new "total available across the project" number
          // so the UI can show "124h of 240h (52%)" instead of just a
          // percent. weeklyHours stays for backward-compat callers.
          availableHours,
          projectWeeks,
          committedHours,
          percentUsed,
          overCommitted: committedHours > availableHours,
        },
        byStatus,
      };
    });

    // Project-wide workload summary (for the leading "Workload" bar chart)
    const totalsForChart = boxes.map((b) => ({
      userId: b.user.id,
      name: `${b.user.firstName} ${b.user.lastName}`,
      avatarUrl: b.user.avatarUrl ?? null,
      totalTasks: b.totals.tasks,
      done: b.totals.done,
      notDone: b.totals.notDone,
    })).sort((a, b) => b.totalTasks - a.totalTasks);

    // Unassigned bucket
    const unassignedTasks = project.tasks.filter((t) => !t.assignedToId);
    const unassigned = unassignedTasks.length
      ? {
          totals: {
            tasks: unassignedTasks.length,
            done: unassignedTasks.filter((t) => t.status === "DONE").length,
            notDone: unassignedTasks.filter((t) => t.status !== "DONE").length,
          },
          tasks: unassignedTasks.map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            estimatedHrs: t.estimatedHrs ? Number(t.estimatedHrs) : null,
          })),
        }
      : null;

    return {
      project: { id: project.id, name: project.name },
      workload: totalsForChart,
      boxes,
      unassigned,
    };
  }

  async createMilestone(projectId: string, dto: { title: string; description?: string; dueDate?: string; status?: string }) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException("Project not found.");
    }
    return this.prisma.milestone.create({
      data: {
        projectId,
        title: dto.title,
        description: dto.description,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        status: dto.status as any,
      },
    });
  }

  async updateMilestone(projectId: string, milestoneId: string, dto: { title?: string; description?: string; dueDate?: string; status?: string }) {
    const milestone = await this.prisma.milestone.findFirst({ where: { id: milestoneId, projectId } });
    if (!milestone) {
      throw new NotFoundException("Milestone not found.");
    }
    return this.prisma.milestone.update({
      where: { id: milestoneId },
      data: {
        title: dto.title,
        description: dto.description,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        status: dto.status as any,
      },
    });
  }

  // ── Project clone ───────────────────────────────────────────────────────
  async clone(id: string, dto: CloneProjectDto, actorId: string) {
    const src = await this.prisma.project.findUnique({
      where: { id },
      include: {
        members: true,
        labels: true,
        customStatuses: true,
        recurringTasks: true,
        milestones: true,
      },
    });
    if (!src) throw new NotFoundException("Project not found.");

    const cloneMembers = dto.cloneMembers ?? true;
    const cloneLabels = dto.cloneLabels ?? true;
    const cloneStatuses = dto.cloneStatuses ?? true;
    const cloneRecurring = dto.cloneRecurring ?? true;
    const cloneMilestones = dto.cloneMilestones ?? true;

    const created = await this.prisma.project.create({
      data: {
        name: dto.name,
        clientId: src.clientId,
        managerId: src.managerId,
        description: src.description,
        startDate: src.startDate,
        endDate: src.endDate,
        // Budget is intentionally reset to 0 so it gets re-entered deliberately.
        budget: 0,
        status: src.status,
        members: cloneMembers && src.members.length
          ? {
              create: src.members.map((m) => ({
                userId: m.userId,
                roleLabel: m.roleLabel,
                allocation: m.allocation,
              })),
            }
          : undefined,
        labels: cloneLabels && src.labels.length
          ? {
              create: src.labels.map((l) => ({
                name: l.name,
                color: l.color,
              })),
            }
          : undefined,
        customStatuses: cloneStatuses && src.customStatuses.length
          ? {
              create: src.customStatuses.map((s) => ({
                name: s.name,
                color: s.color,
                sortOrder: s.sortOrder,
                isDone: s.isDone,
                isDefault: s.isDefault,
              })),
            }
          : undefined,
        milestones: cloneMilestones && src.milestones.length
          ? {
              create: src.milestones.map((m) => ({
                title: m.title,
                description: m.description,
                dueDate: m.dueDate,
                status: "NOT_STARTED" as const,
              })),
            }
          : undefined,
      },
    });

    // Recurring templates need createdById and a fresh nextRunAt based on the new project's startDate
    if (cloneRecurring && src.recurringTasks.length) {
      for (const r of src.recurringTasks) {
        await this.prisma.recurringTaskTemplate.create({
          data: {
            projectId: created.id,
            title: r.title,
            description: r.description,
            priority: r.priority,
            assignedToId: r.assignedToId,
            storyPoints: r.storyPoints,
            estimatedHrs: r.estimatedHrs,
            sprintAssign: r.sprintAssign,
            frequency: r.frequency,
            dayOfWeek: r.dayOfWeek,
            dayOfMonth: r.dayOfMonth,
            startDate: created.startDate,
            endDate: r.endDate,
            nextRunAt: created.startDate,
            status: r.status,
            createdById: actorId,
          },
        });
      }
    }

    try {
      await this.prisma.activityLog.create({
        data: {
          userId: actorId,
          action: ActivityAction.CREATED,
          entityType: "project",
          entityId: created.id,
          entityName: created.name,
          details: `Cloned from "${src.name}"`,
        },
      });
    } catch {
      /* non-fatal */
    }

    // Create matching PROJECT channel for the cloned project.
    try {
      await this.chat.ensureProjectChannel(created.id);
    } catch {
      /* non-fatal */
    }

    // Notify cloned members + manager (excluding the actor).
    const cloneMemberIds =
      cloneMembers && src.members.length ? src.members.map((m) => m.userId) : [];
    await this.notifyMembersAdded(
      { id: created.id, name: created.name },
      [...cloneMemberIds, created.managerId],
      actorId,
    );

    return this.findOne(created.id);
  }

  // ── User capacity (aggregate across all projects) ───────────────────────
  async userCapacity(userId: string) {
    const [profile, activeTasks] = await Promise.all([
      this.prisma.employeeProfile.findUnique({
        where: { userId },
        select: { weeklyCapacityHrs: true },
      }),
      this.prisma.task.findMany({
        where: {
          assignedToId: userId,
          status: { not: "DONE" },
          project: { status: { notIn: ["CANCELLED", "COMPLETED"] } },
        },
        select: {
          estimatedHrs: true,
          project: { select: { id: true, name: true } },
        },
      }),
    ]);

    const weeklyHours = profile ? Number(profile.weeklyCapacityHrs) : 40;
    const committedHours = Math.round(
      activeTasks.reduce((s, t) => s + effectiveTaskHours(t.estimatedHrs), 0) * 100,
    ) / 100;
    const percentUsed = weeklyHours > 0
      ? Math.round((committedHours / weeklyHours) * 100)
      : 0;

    const byProject = new Map<string, { project: { id: string; name: string }; committedHours: number }>();
    for (const t of activeTasks) {
      if (!t.project) continue;
      const entry = byProject.get(t.project.id) ?? {
        project: t.project,
        committedHours: 0,
      };
      entry.committedHours += effectiveTaskHours(t.estimatedHrs);
      byProject.set(t.project.id, entry);
    }
    const projects = [...byProject.values()].map((p) => ({
      project: p.project,
      committedHours: Math.round(p.committedHours * 100) / 100,
    }));

    return {
      weeklyHours,
      committedHours,
      percentUsed,
      overCommitted: committedHours > weeklyHours,
      projects,
    };
  }

  // ── Portfolio summary (JOB 4) ──────────────────────────────────────────
  /**
   * Return a compact health/progress summary per project. Scope mirrors
   * findAll: admins see all, employees see only projects they're part of.
   */
  async portfolio(opts: { id: string; isAdmin: boolean; isFinance: boolean }) {
    const access = this.buildAccessWhere(opts.id, !opts.isAdmin);
    const projects = await this.prisma.project.findMany({
      where: { ...access },
      include: {
        manager: { select: { id: true, firstName: true, lastName: true } },
        tasks: {
          select: {
            id: true,
            status: true,
            dueDate: true,
            assignedToId: true,
            storyPoints: true,
          },
        },
        sprints: {
          where: { status: "ACTIVE" },
          select: { name: true },
          take: 1,
          orderBy: { startDate: "desc" },
        },
        members: { select: { id: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    const now = new Date();
    return projects.map((p) => {
      const total = p.tasks.length;
      const done = p.tasks.filter((t) => t.status === "DONE").length;
      const overdue = p.tasks.filter(
        (t) => t.status !== "DONE" && t.dueDate && t.dueDate < now,
      ).length;
      const unassigned = p.tasks.filter((t) => !t.assignedToId).length;
      const storyPointsTotal = p.tasks.reduce((s, t) => s + (t.storyPoints ?? 0), 0);
      const storyPointsDone = p.tasks
        .filter((t) => t.status === "DONE")
        .reduce((s, t) => s + (t.storyPoints ?? 0), 0);

      const progressPercent = storyPointsTotal > 0
        ? Math.round((storyPointsDone / storyPointsTotal) * 100)
        : total > 0
          ? Math.round((done / total) * 100)
          : 0;

      const health = this.projectHealth({
        endDate: p.endDate,
        progressPercent,
        overdue,
        now,
      });

      const row: Record<string, unknown> = {
        id: p.id,
        name: p.name,
        status: p.status,
        managerId: p.managerId,
        manager: p.manager
          ? { firstName: p.manager.firstName, lastName: p.manager.lastName }
          : null,
        startDate: p.startDate,
        endDate: p.endDate,
        taskTotals: { total, done, overdue, unassigned },
        storyPointsTotal,
        storyPointsDone,
        progressPercent,
        health,
        activeSprintName: p.sprints[0]?.name ?? null,
        memberCount: p.members.length,
      };
      if (opts.isAdmin || opts.isFinance) {
        row.budget = p.budget;
      }
      return row;
    });
  }

  /** Simple 3-bucket health classification. */
  private projectHealth(args: {
    endDate: Date | null;
    progressPercent: number;
    overdue: number;
    now: Date;
  }): "ON_TRACK" | "AT_RISK" | "OFF_TRACK" {
    if (!args.endDate) return "ON_TRACK";
    if (args.endDate < args.now && args.progressPercent < 100) return "OFF_TRACK";
    if (args.overdue > 0) return "AT_RISK";
    // Velocity guard: if remaining time is less than expected-to-complete the
    // remaining work at the current progress rate, flag at-risk.
    const totalMs = args.endDate.getTime() - args.now.getTime();
    if (args.progressPercent < 100 && totalMs > 0 && args.progressPercent > 0) {
      const elapsedFraction = args.progressPercent / 100;
      const expectedRemaining = (totalMs / elapsedFraction) * (1 - elapsedFraction);
      if (expectedRemaining > totalMs * 1.25) return "AT_RISK";
    }
    return "ON_TRACK";
  }

  // ── Burn rate (JOB 5) ──────────────────────────────────────────────────
  /**
   * Budget vs. spent breakdown, by month (last 12) and by user.
   * Labor cost = sum over time entries of (duration hours × employee hourly rate).
   * Includes project expenses as a separate category.
   */
  async burnRate(projectId: string, canSeeFinance: boolean) {
    if (!canSeeFinance) {
      throw new ForbiddenException("Finance data is restricted.");
    }
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, budget: true },
    });
    if (!project) throw new NotFoundException("Project not found.");

    const [entries, expenses] = await Promise.all([
      this.prisma.timeEntry.findMany({
        where: { projectId, duration: { not: null } },
        select: {
          userId: true,
          duration: true,
          startTime: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              employeeProfile: { select: { hourlyRate: true } },
            },
          },
        },
      }),
      this.prisma.projectExpense.findMany({
        where: { projectId },
        select: {
          amount: true,
          incurredAt: true,
          category: true,
        },
      }),
    ]);

    const byUserMap = new Map<string, { userName: string; hours: number; laborCost: number }>();
    const byMonthMap = new Map<string, { hours: number; laborCost: number; expenses: number }>();
    let laborCost = 0;

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 11);
    cutoff.setDate(1);
    cutoff.setHours(0, 0, 0, 0);

    for (const e of entries) {
      const hours = (e.duration ?? 0) / 60;
      const rateRaw = e.user?.employeeProfile?.hourlyRate;
      const rate = rateRaw ? Number(rateRaw) : 0;
      const amount = hours * rate;
      laborCost += amount;

      const uname = e.user
        ? `${e.user.firstName ?? ""} ${e.user.lastName ?? ""}`.trim() || e.user.email
        : e.userId;
      const u = byUserMap.get(e.userId) ?? { userName: uname, hours: 0, laborCost: 0 };
      u.hours += hours;
      u.laborCost += amount;
      byUserMap.set(e.userId, u);

      if (e.startTime >= cutoff) {
        const monthKey = `${e.startTime.getFullYear()}-${String(e.startTime.getMonth() + 1).padStart(2, "0")}`;
        const m = byMonthMap.get(monthKey) ?? { hours: 0, laborCost: 0, expenses: 0 };
        m.hours += hours;
        m.laborCost += amount;
        byMonthMap.set(monthKey, m);
      }
    }

    let expensesTotal = 0;
    const byCategoryMap = new Map<string, { amount: number; count: number }>();
    for (const ex of expenses) {
      const amt = Number(ex.amount ?? 0);
      expensesTotal += amt;
      const bucket = byCategoryMap.get(ex.category) ?? { amount: 0, count: 0 };
      bucket.amount += amt;
      bucket.count += 1;
      byCategoryMap.set(ex.category, bucket);

      if (ex.incurredAt >= cutoff) {
        const monthKey = `${ex.incurredAt.getFullYear()}-${String(ex.incurredAt.getMonth() + 1).padStart(2, "0")}`;
        const m = byMonthMap.get(monthKey) ?? { hours: 0, laborCost: 0, expenses: 0 };
        m.expenses += amt;
        byMonthMap.set(monthKey, m);
      }
    }

    const round = (n: number) => Math.round(n * 100) / 100;
    const budget = Number(project.budget ?? 0);
    const totalSpent = laborCost + expensesTotal;

    const byMonth = [...byMonthMap.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([month, v]) => ({
        month,
        hours: round(v.hours),
        laborCost: round(v.laborCost),
        expenses: round(v.expenses),
        total: round(v.laborCost + v.expenses),
      }));

    const byUser = [...byUserMap.entries()]
      .map(([userId, v]) => {
        const lc = round(v.laborCost);
        return {
          userId,
          userName: v.userName,
          hours: round(v.hours),
          laborCost: lc,
          // Back-compat alias — existing UI expected `amount`.
          amount: lc,
        };
      })
      .sort((a, b) => b.laborCost - a.laborCost || b.hours - a.hours);

    const byCategory = [...byCategoryMap.entries()]
      .map(([category, v]) => ({
        category,
        amount: round(v.amount),
        count: v.count,
      }))
      .sort((a, b) => b.amount - a.amount);

    return {
      budget,
      laborCost: round(laborCost),
      expensesTotal: round(expensesTotal),
      totalSpent: round(totalSpent),
      remaining: round(budget - totalSpent),
      byMonth,
      byUser,
      byCategory,
    };
  }

  // ── Profit & Loss ──────────────────────────────────────────────────────
  /**
   * Revenue (sum of paid invoices) vs. total cost (labor + expenses) per project.
   * Returns a compact P&L payload used by the finance view.
   */
  async profitLoss(projectId: string, canSeeFinance: boolean) {
    if (!canSeeFinance) {
      throw new ForbiddenException("Finance data is restricted.");
    }
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException("Project not found.");

    const burn = await this.burnRate(projectId, true);

    const [paidAgg, paidCount, totalCount] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: { projectId, status: "PAID" },
        _sum: { total: true },
      }),
      this.prisma.invoice.count({ where: { projectId, status: "PAID" } }),
      this.prisma.invoice.count({ where: { projectId } }),
    ]);

    const round = (n: number) => Math.round(n * 100) / 100;
    const revenue = round(Number(paidAgg._sum.total ?? 0));
    const laborCost = burn.laborCost;
    const expensesTotal = burn.expensesTotal;
    const totalCost = round(laborCost + expensesTotal);
    const grossProfit = round(revenue - totalCost);
    const grossMarginPercent = revenue > 0
      ? Math.round((grossProfit / revenue) * 10000) / 100
      : 0;

    return {
      revenue,
      laborCost,
      expensesTotal,
      totalCost,
      grossProfit,
      grossMarginPercent,
      invoicesPaid: paidCount,
      invoicesTotal: totalCount,
    };
  }

  async removeMilestone(projectId: string, milestoneId: string) {
    const milestone = await this.prisma.milestone.findFirst({ where: { id: milestoneId, projectId } });
    if (!milestone) {
      throw new NotFoundException("Milestone not found.");
    }
    return this.prisma.milestone.delete({ where: { id: milestoneId } });
  }

  /**
   * Build a Proposal record for an existing project by reading its
   * saved milestones, tasks, and budget — no AI involved. Used as a
   * backfill button for projects that were created before the auto-
   * proposal flow shipped, or where the auto step failed.
   *
   * Returns the newly created proposal id. If one already exists for
   * this project the caller can decide whether to overwrite (not done
   * here) or just open the existing one.
   */
  async createProposalFromProject(projectId: string, actorId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        client: { select: { companyName: true } },
        milestones: { orderBy: { dueDate: "asc" } },
        tasks: { select: { title: true, description: true, estimatedHrs: true, milestoneId: true } },
        sprints: { orderBy: { startDate: "asc" } },
      },
    });
    if (!project) throw new NotFoundException("Project not found.");

    const orgSettings = await this.prisma.organizationSettings.findFirst({
      select: { baseCurrency: true, defaultHourlyRate: true },
    });
    const currency = orgSettings?.baseCurrency ?? "INR";
    const symbol = currency === "INR" ? "₹" : currency === "USD" ? "$" : currency + " ";
    const fmt = (n: number) => `${symbol}${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
    // Project rate wins. Falls back to org default only if the project
    // has none stored — which can happen on legacy rows from before
    // the per-project rate column existed.
    const hourlyRate = project.hourlyRate != null
      ? Number(project.hourlyRate)
      : Number(orgSettings?.defaultHourlyRate ?? 900);

    const totalHours = project.tasks.reduce((s, t) => s + Number(t.estimatedHrs ?? 0), 0);
    const finalBudget = Number(project.budget ?? 0);

    const blocks = project.milestones.map((m) => {
      const tasksInMilestone = project.tasks.filter((t) => t.milestoneId === m.id);
      const totalHrs = tasksInMilestone.reduce((s, t) => s + Number(t.estimatedHrs ?? 0), 0);
      const weeks = Math.max(1, Math.ceil(totalHrs / 30));
      const bullets = tasksInMilestone
        .map((t) => `• ${t.title}${t.estimatedHrs ? ` (${Number(t.estimatedHrs)}h)` : ""}`)
        .join("\n");
      const content = [
        m.description ?? `${tasksInMilestone.length} deliverables totaling ${totalHrs.toFixed(0)} hours of work.`,
        "",
        bullets,
        "",
        `Acceptance: All ${tasksInMilestone.length} deliverables shipped and signed off by ${m.dueDate ? m.dueDate.toISOString().slice(0, 10) : "the milestone date"}.`,
      ].join("\n");
      return { heading: m.title, content, durationWeeks: weeks };
    });

    const includedDeliverables = project.tasks.slice(0, 14).map((t) => ({
      kind: "INCLUDED" as const,
      title: t.title,
      description: t.description ?? "",
      amount: t.estimatedHrs ? Math.round(Number(t.estimatedHrs) * hourlyRate) : undefined,
    }));
    const standardExclusions = [
      { title: "Hosting & Domain", description: "Server hosting, CDN, DNS, domain registration, SSL certs (client pays directly)." },
      { title: "Third-Party API & SaaS Costs", description: "Stripe / Razorpay / Twilio / SendGrid / OpenAI / cloud bills — billed to client directly." },
      { title: "Content & Copywriting", description: "Product descriptions, blog posts, marketing copy beyond placeholder text." },
      { title: "Photography & Video", description: "Stock or custom photo/video production, motion graphics." },
      { title: "Long-term Maintenance & Support", description: "Bug-fix work beyond the 14-day post-launch warranty is a separate retainer." },
      { title: "Change Requests After Sign-off", description: "Anything not in the INCLUDED list above is treated as a new feature and quoted as a Change Request." },
      { title: "Anything not listed above", description: "Any feature, integration, or scope addition not explicitly listed in the Included Deliverables is treated as a new feature and will be quoted separately." },
    ].map((e) => ({ kind: "EXCLUDED" as const, title: e.title, description: e.description, amount: undefined }));

    const totalWeeks = blocks.reduce((s, b) => s + (b.durationWeeks ?? 0), 0);
    const timeline = totalWeeks > 0
      ? `${totalWeeks} weeks · ${project.milestones.length} milestones`
      : `${project.milestones.length} milestones`;
    const pricing = `${fmt(finalBudget)} · ${totalHours.toFixed(0)} hours @ ${fmt(hourlyRate)}/hour`;

    // Conversion-oriented cover copy via AI. When the call fails or
    // returns thin output, fall back to a structured polished paragraph
    // built from the plan metadata — NEVER dump the raw user brief
    // (`project.description`) verbatim, because that's how scribbles
    // like "basic shopify store" end up as the Executive Summary text.
    const aiCopy = await this.ai.generateProposalCopy({
      projectName: project.name,
      requirement: project.description ?? `${project.name} — ${project.milestones.length} milestones, ${project.tasks.length} deliverables`,
      clientName: project.client?.companyName,
      totalHours,
      milestoneTitles: project.milestones.map((m) => m.title),
      budget: finalBudget,
      currency,
    });
    const fallbackCopy = this.buildProposalFallbackCopy({
      projectName: project.name,
      clientName: project.client?.companyName,
      milestoneTitles: project.milestones.map((m) => m.title),
      deliverableCount: project.tasks.length,
      totalHours,
      totalWeeks: Math.max(1, Math.ceil(totalHours / 42)),
      formattedBudget: fmt(finalBudget),
      formattedRate: `${fmt(hourlyRate)}/hour`,
    });
    const description = this.looksProfessional(aiCopy?.description)
      ? (aiCopy?.description as string)
      : fallbackCopy.description;
    const projectUnderstanding = this.looksProfessional(aiCopy?.projectUnderstanding)
      ? (aiCopy?.projectUnderstanding as string)
      : fallbackCopy.projectUnderstanding;

    const proposal = await this.prisma.proposal.create({
      data: {
        clientId: project.clientId,
        projectId,
        projectName: project.name,
        description,
        projectUnderstanding,
        timeline,
        pricing,
        paymentTermsText: "50% — Advance\n30% — Mid-project\n20% — Final",
        createdById: actorId,
        blocks: {
          create: blocks.map((b, i) => ({
            heading: b.heading,
            content: b.content,
            durationWeeks: b.durationWeeks ?? null,
            sortOrder: i + 1,
          })),
        },
        deliverables: {
          create: [...includedDeliverables, ...standardExclusions].map((d, i) => ({
            kind: d.kind,
            title: d.title,
            description: d.description,
            amount: d.amount ?? null,
            sortOrder: i,
          })),
        },
      },
    });
    return { proposalId: proposal.id };
  }

  /**
   * One-shot "create project with AI" — used by the "Create with AI"
   * path on the projects list. Creates the empty project shell first
   * (so we have an id), then asks the AI for a plan, then returns
   * BOTH the new project id and the plan preview. The caller (frontend)
   * then lets the user edit the plan and calls `aiApplyPlan` to commit.
   *
   * If the user cancels at the preview stage, the empty project just
   * sits there with no tasks/milestones — same as if they'd created
   * a project normally and walked away. They can delete it via the
   * normal Delete flow.
   */
  async createWithAi(
    dto: CreateProjectDto & { requirement: string; hourlyRate?: number },
    actorId: string,
  ) {
    if (!dto.requirement || dto.requirement.trim().length < 12) {
      throw new ForbiddenException("Please describe the project requirement in more detail.");
    }
    // 1. Create the project shell using the existing create() flow so
    //    we inherit member roster + default milestone seeding + chat
    //    channel + notification side effects.
    //
    //    Project.budget is non-nullable in the schema, but the AI flow
    //    sets it AFTER plan generation (totalHours × hourlyRate). Seed
    //    with 0 so create() doesn't reject, then applyAiPlan overwrites.
    //    Same story for managerId — default to the creating user if
    //    the form didn't pick one explicitly.
    const project = await this.create(
      {
        ...dto,
        budget: dto.budget ?? 0,
        managerId: dto.managerId || actorId,
      },
      actorId,
    );

    // 2. Pull plan context (now includes team workload from other projects).
    const { team, project: ctx } = await this.aiPlanContext(project.id);

    // 3. Ask the AI for a plan. The hourly rate is plumbed through so
    //    the AI can communicate the eventual budget in its descriptions.
    let plan;
    try {
      plan = await this.ai.generateProjectPlan({
        projectName: ctx.name,
        requirement: dto.requirement,
        budget: dto.budget ?? (ctx.budget ? Number(ctx.budget) : undefined),
        startDate: ctx.startDate ? ctx.startDate.toISOString().slice(0, 10) : undefined,
        endDate: ctx.endDate ? ctx.endDate.toISOString().slice(0, 10) : undefined,
        team: team.map((m) => ({
          id: m.id,
          name: m.name,
          role: m.role,
          existingCommittedHours: m.existingCommittedHours,
          existingOpenTasks: m.existingOpenTasks,
        })),
      });
    } catch (err) {
      // AI failure shouldn't destroy the freshly created project —
      // return it with an empty plan so the user can still proceed
      // manually or retry generation from the Overview tab.
      this.logger.warn(`AI plan generation failed during createWithAi for ${project.id}: ${(err as Error).message}`);
      return { project, plan: { milestones: [], sprints: [], tasks: [] }, team, aiError: (err as Error).message };
    }
    return { project, plan, team };
  }

  /**
   * Read the project context the AI needs to generate a sensible plan:
   * basic identity (name, dates, budget), the team roster with roles,
   * AND each team member's current commitments on OTHER active projects.
   *
   * The workload number matters: if Aarav already has 40h booked across
   * other projects through end of month, the AI shouldn't add another
   * 50h to his plate on this one. Without this context the planner sees
   * each project in isolation and stacks load on the same few people.
   *
   * Used by:
   *   - preview endpoint (pass to AiService)
   *   - apply endpoint (defend "tasks must belong to project's members")
   */
  async aiPlanContext(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        description: true,
        budget: true,
        startDate: true,
        endDate: true,
        clientId: true,
        members: {
          select: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                employeeProfile: { select: { designation: true, department: true } },
                roles: { select: { role: { select: { code: true, name: true } } } },
              },
            },
          },
        },
      },
    });
    if (!project) throw new NotFoundException("Project not found.");

    const memberIds = project.members.map((m) => m.user.id);

    // For each team member, sum estimated hours on OPEN tasks across
    // every ACTIVE project EXCEPT this one. ACTIVE = not COMPLETED /
    // CANCELLED. Open = task status not DONE. This is "committed hours
    // they already owe somebody" — capacity the AI should bake in.
    const otherCommitments = memberIds.length
      ? await this.prisma.task.groupBy({
          by: ["assignedToId"],
          where: {
            assignedToId: { in: memberIds },
            status: { not: "DONE" },
            projectId: { not: projectId },
            project: { status: { notIn: ["COMPLETED", "CANCELLED"] } },
            estimatedHrs: { not: null },
          },
          _sum: { estimatedHrs: true },
          _count: { _all: true },
        })
      : [];
    const committedByUser = new Map(
      otherCommitments.map((r) => [
        r.assignedToId!,
        {
          hours: Number(r._sum.estimatedHrs ?? 0),
          openTaskCount: r._count._all,
        },
      ]),
    );

    const team = project.members.map((m) => {
      const u = m.user;
      const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
      const role =
        u.employeeProfile?.designation ?? u.roles[0]?.role.name ?? "Team member";
      const committed = committedByUser.get(u.id) ?? { hours: 0, openTaskCount: 0 };
      return {
        id: u.id,
        name,
        role,
        existingCommittedHours: Math.round(committed.hours * 10) / 10,
        existingOpenTasks: committed.openTaskCount,
      };
    });

    return { project, team };
  }

  /**
   * Rebalance an existing project's open task assignments so no one
   * carries more than `MAX_SHARE` of total hours. Also distributes any
   * UNASSIGNED open tasks to the least-loaded teammates in round-robin
   * order. Same algorithm we apply during AI plan generation, run
   * against live tasks instead.
   *
   * Returns a summary of what moved so the UI can show "Moved 7 tasks
   * to balance workload" rather than just silently swapping.
   */
  async rebalanceWorkload(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        managerId: true,
        members: { select: { userId: true, user: { select: { firstName: true, lastName: true } } } },
        tasks: {
          where: { status: { not: "DONE" } },
          select: { id: true, assignedToId: true, estimatedHrs: true, title: true },
        },
      },
    });
    if (!project) throw new NotFoundException("Project not found.");
    // Include the PM as a rebalance target — they're a real person on
    // the project, just stored on a different column. Matches what
    // `workload()` already does for the display.
    const memberIds = Array.from(new Set([project.managerId, ...project.members.map((m) => m.userId)]));
    if (memberIds.length < 1) {
      return { moved: 0, assigned: 0, message: "No team members to rebalance to." };
    }

    type Task = { id: string; assignedToId: string | null; estimatedHrs: number; title: string };
    const tasks: Task[] = project.tasks.map((t) => ({
      id: t.id,
      assignedToId: t.assignedToId,
      estimatedHrs: t.estimatedHrs ? Number(t.estimatedHrs) : 4, // default for unestimated
      title: t.title,
    }));

    // Step 1: assign every unassigned task to the currently lightest
    // team member. Default 4h estimate so the load math still works.
    const loadById = new Map<string, number>();
    for (const id of memberIds) loadById.set(id, 0);
    for (const t of tasks) {
      if (t.assignedToId && loadById.has(t.assignedToId)) {
        loadById.set(t.assignedToId, loadById.get(t.assignedToId)! + t.estimatedHrs);
      }
    }
    const pickLightest = (excludeId?: string) => {
      let id: string | null = null;
      let min = Infinity;
      for (const [k, v] of loadById) {
        if (excludeId && k === excludeId) continue;
        if (v < min) { min = v; id = k; }
      }
      return id;
    };

    let assigned = 0;
    for (const t of tasks) {
      if (!t.assignedToId || !loadById.has(t.assignedToId)) {
        const newOwner = pickLightest();
        if (!newOwner) break;
        t.assignedToId = newOwner;
        loadById.set(newOwner, loadById.get(newOwner)! + t.estimatedHrs);
        assigned++;
      }
    }

    // Step 2: cap any single person at MAX_SHARE of total hours. Move
    // their biggest tasks to the lightest teammate until the cap holds.
    const MAX_SHARE = 0.6;
    const totalHrs = [...loadById.values()].reduce((s, v) => s + v, 0);
    let moved = 0;
    if (totalHrs > 0 && memberIds.length >= 2) {
      const cap = totalHrs * MAX_SHARE;
      const heaviest = () => {
        let id: string | null = null;
        let max = 0;
        for (const [k, v] of loadById) {
          if (v > max) { max = v; id = k; }
        }
        return { id, hrs: max };
      };
      let safety = 0;
      while (safety++ < 100) {
        const heavy = heaviest();
        if (!heavy.id || heavy.hrs <= cap) break;
        const candidates = tasks
          .filter((t) => t.assignedToId === heavy.id)
          .sort((a, b) => b.estimatedHrs - a.estimatedHrs);
        if (candidates.length === 0) break;
        const newOwner = pickLightest(heavy.id);
        if (!newOwner) break;
        const moving = candidates[0];
        moving.assignedToId = newOwner;
        loadById.set(heavy.id, loadById.get(heavy.id)! - moving.estimatedHrs);
        loadById.set(newOwner, loadById.get(newOwner)! + moving.estimatedHrs);
        moved++;
      }
    }

    // Step 3: commit the changes only for tasks whose assignee actually
    // changed. We track the original snapshot via the original Prisma
    // result so we don't write rows that didn't move.
    const originalById = new Map(project.tasks.map((t) => [t.id, t.assignedToId]));
    const updates = tasks.filter((t) => t.assignedToId !== originalById.get(t.id));
    if (updates.length > 0) {
      await this.prisma.$transaction(
        updates.map((t) =>
          this.prisma.task.update({
            where: { id: t.id },
            data: { assignedToId: t.assignedToId },
          }),
        ),
      );
    }

    return {
      moved,
      assigned,
      totalTasks: tasks.length,
      message:
        moved === 0 && assigned === 0
          ? "Workload is already balanced."
          : `${assigned > 0 ? `Assigned ${assigned} task${assigned === 1 ? "" : "s"}.` : ""}${assigned > 0 && moved > 0 ? " " : ""}${moved > 0 ? `Moved ${moved} task${moved === 1 ? "" : "s"} to balance load.` : ""}`,
    };
  }

  /**
   * Apply a (possibly user-edited) AI-generated plan to a project.
   *
   * What this does, in order:
   *   1. Creates milestones, sprints, top-level tasks (+ their subtasks)
   *      inside a single transaction so partial state is impossible.
   *   2. Computes total estimated hours across all top-level tasks.
   *   3. Updates `project.budget` to (totalHours × org hourly rate) when
   *      the project doesn't already have a budget set. Existing budgets
   *      are left alone — the user may have negotiated a fixed price.
   *   4. Seeds the default 50/30/20 payment-milestone schedule if the
   *      project has none yet.
   *   5. Generates the first invoice (Advance, 50% of budget) in DRAFT
   *      so finance has something to review immediately.
   *   6. Generates a client-facing Proposal record using the same AI
   *      that powers the Proposals page. Non-fatal on failure — the
   *      delivery plan is what matters, the proposal is a nice-to-have.
   *
   * Steps 3-6 are best-effort and log+swallow errors so a downstream
   * hiccup doesn't unwind the plan that was successfully created.
   */
  async applyAiPlan(
    projectId: string,
    plan: {
      milestones: Array<{ title: string; description?: string; dueDate?: string }>;
      sprints?: Array<{ name: string; goal?: string; startDate: string; endDate: string }>;
      tasks: Array<{
        title: string;
        description?: string;
        milestoneIndex: number;
        sprintIndex?: number;
        assignedToId?: string;
        estimatedHrs?: number;
        priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
        dueDate?: string;
        subtasks?: Array<{ title: string; estimatedHrs?: number }>;
      }>;
      /** Optional — the requirement the user typed when generating the plan. Used for the proposal copy. */
      requirement?: string;
      /** Toggle the auto-proposal + initial-invoice automation. Default true. */
      autoFinalize?: boolean;
      /** Per-project hourly rate override. Falls back to OrganizationSettings.defaultHourlyRate. */
      hourlyRate?: number;
      /** Explicit budget override. When set, totalHours × hourlyRate is ignored. */
      budget?: number | null;
    },
    actorId: string,
  ) {
    const { team, project: ctx } = await this.aiPlanContext(projectId);
    const memberIds = new Set(team.map((t) => t.id));
    const autoFinalize = plan.autoFinalize !== false;

    // ── Step 1: create milestones + sprints + tasks (+ subtasks) ──
    const created = await this.prisma.$transaction(async (tx) => {
      const milestones = [];
      for (const m of plan.milestones) {
        const row = await tx.milestone.create({
          data: {
            projectId,
            title: m.title.slice(0, 200),
            description: m.description?.slice(0, 1000) || null,
            dueDate: m.dueDate ? new Date(m.dueDate) : null,
          },
        });
        milestones.push(row);
      }
      const sprints = [];
      for (const s of plan.sprints ?? []) {
        const row = await tx.sprint.create({
          data: {
            projectId,
            name: s.name.slice(0, 120),
            goal: s.goal?.slice(0, 500) || null,
            startDate: new Date(s.startDate),
            endDate: new Date(s.endDate),
          },
        });
        sprints.push(row);
      }
      const tasks = [];
      const subtasks = [];
      for (const t of plan.tasks) {
        // Clamp milestoneIndex into bounds — the user may have deleted
        // milestones in the preview without reindexing tasks. Falling
        // back to milestone 0 keeps the task discoverable; null-ing it
        // would lose the task on the Milestones tab.
        const mIdx = Math.min(Math.max(0, t.milestoneIndex ?? 0), Math.max(0, milestones.length - 1));
        const milestone = milestones[mIdx];
        const sIdx = typeof t.sprintIndex === "number"
          ? Math.min(Math.max(0, t.sprintIndex), Math.max(0, sprints.length - 1))
          : -1;
        const sprint = sIdx >= 0 && sIdx < sprints.length ? sprints[sIdx] : undefined;
        const assignedToId = t.assignedToId && memberIds.has(t.assignedToId) ? t.assignedToId : null;
        const parent = await tx.task.create({
          data: {
            projectId,
            title: t.title.slice(0, 300),
            description: t.description?.slice(0, 2000) || null,
            assignedToId,
            estimatedHrs:
              typeof t.estimatedHrs === "number" && t.estimatedHrs > 0
                ? new Prisma.Decimal(t.estimatedHrs.toFixed(2))
                : null,
            priority: (t.priority as Prisma.EnumPriorityFieldUpdateOperationsInput["set"]) ?? "MEDIUM",
            dueDate: t.dueDate ? new Date(t.dueDate) : null,
            milestoneId: milestone?.id ?? null,
            sprintId: sprint?.id ?? null,
          },
        });
        tasks.push(parent);
        // Subtasks inherit the parent's assignee + due date so the
        // person responsible doesn't have to chase them down.
        for (const st of t.subtasks ?? []) {
          const child = await tx.task.create({
            data: {
              projectId,
              parentId: parent.id,
              title: st.title.slice(0, 300),
              assignedToId,
              estimatedHrs:
                typeof st.estimatedHrs === "number" && st.estimatedHrs > 0
                  ? new Prisma.Decimal(st.estimatedHrs.toFixed(2))
                  : null,
              priority: parent.priority,
              dueDate: parent.dueDate ?? null,
              milestoneId: milestone?.id ?? null,
              sprintId: sprint?.id ?? null,
            },
          });
          subtasks.push(child);
        }
      }
      return { milestones, sprints, tasks, subtasks };
    });

    // ── Step 2: total hours from PARENT tasks (subtasks roll up so we
    //          don't double-count). ──
    const totalHours = plan.tasks.reduce(
      (s, t) => s + (typeof t.estimatedHrs === "number" && t.estimatedHrs > 0 ? t.estimatedHrs : 0),
      0,
    );

    // ── Step 3-6: best-effort post-processing. Each step is wrapped in
    //          try/catch so a downstream hiccup doesn't unwind the plan. ──
    let computedBudget: number | null = null;
    let firstInvoiceId: string | null = null;
    let proposalId: string | null = null;
    try {
      const orgSettings = await this.prisma.organizationSettings.findFirst({
        select: { defaultHourlyRate: true },
      });
      const hourlyRate = typeof plan.hourlyRate === "number" && plan.hourlyRate > 0
        ? plan.hourlyRate
        : Number(orgSettings?.defaultHourlyRate ?? 900);
      const autoBudget = Math.round(totalHours * hourlyRate);
      // Explicit override wins. Otherwise auto-budget.
      computedBudget = typeof plan.budget === "number" && plan.budget > 0 ? plan.budget : autoBudget;

      const currentBudget = Number(ctx.budget ?? 0);
      const projectUpdate: Prisma.ProjectUpdateInput = {};
      if ((currentBudget <= 0 || typeof plan.budget === "number") && computedBudget > 0) {
        projectUpdate.budget = new Prisma.Decimal(computedBudget);
      }
      // Persist the hourly rate on the project so the proposal +
      // future payment milestone generation use THIS engagement's
      // rate, not the org default.
      if (typeof plan.hourlyRate === "number" && plan.hourlyRate > 0) {
        projectUpdate.hourlyRate = new Prisma.Decimal(plan.hourlyRate);
      }
      // Project endDate from the plan's latest dueDate (milestones +
      // tasks + sprints). Only fill in when the project doesn't
      // already have one set — the user might have a hard launch date
      // they don't want overwritten.
      if (!ctx.endDate) {
        const latestDate = [
          ...plan.milestones.map((m) => m.dueDate),
          ...plan.tasks.map((t) => t.dueDate),
          ...(plan.sprints ?? []).map((s) => s.endDate),
        ]
          .filter((d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d))
          .sort()
          .pop();
        if (latestDate) {
          projectUpdate.endDate = new Date(latestDate);
        }
      }
      if (Object.keys(projectUpdate).length > 0) {
        await this.prisma.project.update({ where: { id: projectId }, data: projectUpdate });
      }
    } catch (err) {
      this.logger.warn(`Budget calculation failed for project ${projectId}: ${(err as Error).message}`);
    }

    if (autoFinalize) {
      try {
        // Seed default 50/30/20 milestones if the project has none.
        const existingMilestones = await this.prisma.projectPaymentMilestone.findMany({
          where: { projectId },
          select: { id: true, sortOrder: true, status: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        });
        if (existingMilestones.length === 0) {
          await this.prisma.projectPaymentMilestone.createMany({
            data: [
              { projectId, label: "Advance", percentage: new Prisma.Decimal(50), sortOrder: 0, status: PaymentMilestoneStatus.PENDING },
              { projectId, label: "Mid-project", percentage: new Prisma.Decimal(30), sortOrder: 1, status: PaymentMilestoneStatus.PENDING },
              { projectId, label: "Final", percentage: new Prisma.Decimal(20), sortOrder: 2, status: PaymentMilestoneStatus.PENDING },
            ],
          });
        }
      } catch (err) {
        this.logger.warn(`Payment milestone seeding failed for project ${projectId}: ${(err as Error).message}`);
      }

      // Generate the Advance (50%) invoice in DRAFT — only if the
      // project now has a budget (else the milestone percentage would
      // resolve to ₹0 and the invoice is useless).
      try {
        const firstPending = await this.prisma.projectPaymentMilestone.findFirst({
          where: { projectId, status: PaymentMilestoneStatus.PENDING },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        });
        const projectNow = await this.prisma.project.findUnique({
          where: { id: projectId },
          select: { budget: true, clientId: true },
        });
        const budgetNow = Number(projectNow?.budget ?? 0);
        if (firstPending && projectNow && budgetNow > 0) {
          // Re-use the same invoice template the manual Generate-invoice
          // button uses — inline here to avoid pulling in PaymentMilestonesService
          // (which would create a circular dep). Same shape, same numbering.
          const settings = await this.prisma.organizationSettings.findFirst();
          const prefix = (settings?.invoicePrefix ?? "INV-").replace(/-?$/, "-");
          const count = await this.prisma.invoice.count();
          const invoiceNumber = `${prefix}${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
          const days = settings?.paymentTerms ?? 30;
          const due = new Date();
          due.setDate(due.getDate() + days);
          const pct = Number(firstPending.percentage);
          const amount = +(budgetNow * (pct / 100)).toFixed(2);

          const invoice = await this.prisma.invoice.create({
            data: {
              invoiceNumber,
              clientId: projectNow.clientId,
              projectId,
              amount,
              tax: 0,
              total: amount,
              status: InvoiceStatus.DRAFT,
              dueDate: due,
              notes:
                `This invoice covers the Advance payment — ${pct}% of the agreed project value of ₹${budgetNow.toLocaleString("en-IN")} (₹${amount.toLocaleString("en-IN")}).\n` +
                `Payment Schedule: 50% Advance · 30% Mid-project · 20% Final.`,
              createdById: actorId,
              items: {
                create: [
                  {
                    description: `${ctx.name} — Advance payment (${pct}%)`,
                    quantity: 1,
                    price: amount,
                    taxAmount: 0,
                    total: amount,
                    sortOrder: 0,
                  },
                ],
              },
            },
          });
          firstInvoiceId = invoice.id;
          await this.prisma.projectPaymentMilestone.update({
            where: { id: firstPending.id },
            data: { invoiceId: invoice.id, status: PaymentMilestoneStatus.INVOICED },
          });
        }
      } catch (err) {
        this.logger.warn(`Auto-invoice generation failed for project ${projectId}: ${(err as Error).message}`);
      }

      // Build the proposal directly from the plan that was just
      // committed — NOT a fresh AI call. The user already approved
      // these milestones, sprints, and budget in the preview, so the
      // proposal must mirror that exactly. Independent AI generation
      // would invent different phases and pricing.
      try {
        if (plan.milestones.length > 0) {
          const orgSettings = await this.prisma.organizationSettings.findFirst({
            select: { baseCurrency: true },
          });
          const currency = orgSettings?.baseCurrency ?? "INR";
          const symbol = currency === "INR" ? "₹" : currency === "USD" ? "$" : currency + " ";
          const fmt = (n: number) =>
            `${symbol}${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

          // Final budget that landed on the project after Step 3.
          const projectAfter = await this.prisma.project.findUnique({
            where: { id: projectId },
            select: { budget: true, startDate: true, endDate: true, hourlyRate: true },
          });
          const finalBudget = Number(projectAfter?.budget ?? computedBudget ?? 0);

          // Phase blocks = one per milestone. Each block lists the
          // tasks it owns and rolls hours up. durationWeeks derived
          // from sprint dates that touch this milestone.
          const blocks = plan.milestones.map((m, mIdx) => {
            const tasksInMilestone = plan.tasks.filter((t) => t.milestoneIndex === mIdx);
            const totalHrs = tasksInMilestone.reduce((s, t) => s + (t.estimatedHrs ?? 0), 0);
            // Take sprints whose dates land between the milestone's start
            // (or project start) and its dueDate. Rough but indicative.
            const milestoneDue = m.dueDate ? new Date(m.dueDate) : null;
            const sprintsInMilestone = (plan.sprints ?? []).filter((s) => {
              if (!milestoneDue) return false;
              return new Date(s.startDate) <= milestoneDue && new Date(s.endDate) >= (projectAfter?.startDate ?? new Date());
            });
            const weeks = sprintsInMilestone.length > 0
              ? sprintsInMilestone.length * 2
              : Math.max(1, Math.ceil(totalHrs / 30));
            const bullets = tasksInMilestone
              .map((t) => `• ${t.title}${t.estimatedHrs ? ` (${t.estimatedHrs}h)` : ""}`)
              .join("\n");
            const content = [
              m.description ?? `${tasksInMilestone.length} deliverables totaling ${totalHrs.toFixed(0)} hours of work.`,
              "",
              bullets,
              "",
              `Acceptance: All ${tasksInMilestone.length} deliverables shipped and signed off by ${m.dueDate ?? "the milestone date"}.`,
            ].join("\n");
            return {
              heading: m.title,
              content,
              durationWeeks: weeks,
            };
          });

          // Deliverables = INCLUDED list (one per task, with hours-based
          // amount) + standard EXCLUDED set protecting against scope creep.
          // Rate precedence: explicit override > project.hourlyRate > org default.
          const projectRate = projectAfter?.hourlyRate ? Number(projectAfter.hourlyRate) : null;
          const hourlyRate = typeof plan.hourlyRate === "number" && plan.hourlyRate > 0
            ? plan.hourlyRate
            : projectRate ?? Number((await this.prisma.organizationSettings.findFirst({ select: { defaultHourlyRate: true } }))?.defaultHourlyRate ?? 900);

          const includedDeliverables = plan.tasks.slice(0, 14).map((t) => ({
            kind: "INCLUDED" as const,
            title: t.title,
            description: t.description ?? "",
            amount: t.estimatedHrs ? Math.round(t.estimatedHrs * hourlyRate) : undefined,
          }));
          const standardExclusions = [
            { title: "Hosting & Domain", description: "Server hosting, CDN, DNS, domain registration, SSL certs (client pays directly)." },
            { title: "Third-Party API & SaaS Costs", description: "Stripe / Razorpay / Twilio / SendGrid / OpenAI / cloud bills — billed to client directly." },
            { title: "Content & Copywriting", description: "Product descriptions, blog posts, marketing copy beyond placeholder text." },
            { title: "Photography & Video", description: "Stock or custom photo/video production, motion graphics." },
            { title: "Long-term Maintenance & Support", description: "Bug-fix work beyond the 14-day post-launch warranty is a separate retainer." },
            { title: "Change Requests After Sign-off", description: "Anything not in the INCLUDED list above is treated as a new feature and quoted as a Change Request." },
            { title: "Anything not listed above", description: "Any feature, integration, or scope addition not explicitly listed in the Included Deliverables is treated as a new feature and will be quoted separately." },
          ].map((e) => ({ kind: "EXCLUDED" as const, title: e.title, description: e.description, amount: undefined }));

          const totalWeeks = blocks.reduce((s, b) => s + (b.durationWeeks ?? 0), 0);
          const timeline = totalWeeks > 0
            ? `${totalWeeks} weeks · ${plan.milestones.length} milestones`
            : `${plan.milestones.length} milestones`;
          const pricing = `${fmt(finalBudget)} · ${totalHours.toFixed(0)} hours @ ${fmt(hourlyRate)}/hour`;
          const paymentTermsText = "50% — Advance\n30% — Mid-project\n20% — Final";

          // Conversion-oriented cover copy via AI (separate light call).
          // When the AI is unavailable / returns thin output, we fall
          // back to a structured polished paragraph built from the
          // plan metadata — NEVER the raw `plan.requirement`, because
          // scribbles like "basic shopify store" landing in the
          // Executive Summary is exactly what makes a proposal look
          // amateur. The looksProfessional() gate also catches the
          // case where Gemini returned something but it's too short
          // to ship.
          const client = await this.prisma.client.findUnique({
            where: { id: ctx.clientId },
            select: { companyName: true },
          });
          const aiCopy = await this.ai.generateProposalCopy({
            projectName: ctx.name,
            requirement: plan.requirement ?? "",
            clientName: client?.companyName ?? undefined,
            totalHours,
            milestoneTitles: plan.milestones.map((m) => m.title),
            budget: finalBudget,
            currency,
          });
          const fallbackCopy = this.buildProposalFallbackCopy({
            projectName: ctx.name,
            clientName: client?.companyName ?? undefined,
            milestoneTitles: plan.milestones.map((m) => m.title),
            deliverableCount: plan.tasks.length,
            totalHours,
            totalWeeks: totalWeeks || Math.max(1, Math.ceil(totalHours / 42)),
            formattedBudget: fmt(finalBudget),
            formattedRate: `${fmt(hourlyRate)}/hour`,
          });
          const description = this.looksProfessional(aiCopy?.description)
            ? (aiCopy?.description as string)
            : fallbackCopy.description;
          const projectUnderstanding = this.looksProfessional(aiCopy?.projectUnderstanding)
            ? (aiCopy?.projectUnderstanding as string)
            : fallbackCopy.projectUnderstanding;

          const proposal = await this.prisma.proposal.create({
            data: {
              clientId: ctx.clientId,
              projectId,
              projectName: ctx.name,
              description,
              projectUnderstanding,
              timeline,
              pricing,
              paymentTermsText,
              createdById: actorId,
              blocks: {
                create: blocks.map((b, i) => ({
                  heading: b.heading,
                  content: b.content,
                  durationWeeks: b.durationWeeks ?? null,
                  sortOrder: i + 1,
                })),
              },
              deliverables: {
                create: [...includedDeliverables, ...standardExclusions].map((d, i) => ({
                  kind: d.kind,
                  title: d.title,
                  description: d.description,
                  amount: d.amount ?? null,
                  sortOrder: i,
                })),
              },
            },
          });
          proposalId = proposal.id;
          this.logger.log(`Auto-proposal created for project ${projectId}: ${proposal.id}`);
        } else {
          this.logger.log(`Skipping proposal for project ${projectId}: no milestones in plan`);
        }
      } catch (err) {
        // Log the full stack — `warn` was hiding the root cause and the
        // try/catch swallows errors silently. Now you'll see WHY in the log.
        this.logger.error(
          `Auto-proposal generation FAILED for project ${projectId}`,
          (err as Error).stack,
        );
      }
    }

    this.logger.log(
      `applyAiPlan finished for ${projectId}: ` +
      `${created.milestones.length} milestones, ${created.sprints.length} sprints, ` +
      `${created.tasks.length} tasks, ${created.subtasks.length} subtasks, ` +
      `budget=${computedBudget ?? "n/a"}, invoice=${firstInvoiceId ?? "n/a"}, proposal=${proposalId ?? "n/a"}`,
    );

    return {
      milestoneCount: created.milestones.length,
      sprintCount: created.sprints.length,
      taskCount: created.tasks.length,
      subtaskCount: created.subtasks.length,
      milestones: created.milestones,
      sprints: created.sprints,
      tasks: created.tasks,
      computedBudget,
      firstInvoiceId,
      proposalId,
    };
  }
}

/**
 * Format a project's elapsed duration as a human label
 * ("12 weeks", "4 months", "1 year") for the project-complete email
 * stat strip. Returns null when start/end aren't both known — we don't
 * want a misleading "0 days" or an estimated duration from incomplete
 * data.
 */
function computeDurationLabel(start: Date | null, end: Date | null): string | null {
  if (!start || !end) return null;
  const ms = end.getTime() - start.getTime();
  if (ms <= 0) return null;
  const days = Math.round(ms / 86_400_000);
  if (days <= 14) return `${days} day${days === 1 ? "" : "s"}`;
  const weeks = Math.round(days / 7);
  if (weeks <= 12) return `${weeks} weeks`;
  const months = Math.round(days / 30);
  if (months < 18) return `${months} months`;
  const years = +(days / 365).toFixed(1);
  return `${years} year${years === 1 ? "" : "s"}`;
}

// (Project lookup needs `ctx` to also expose clientId for the proposal
// step. We rely on Prisma's inferred return type — `aiPlanContext`
// already selects `clientId` via the include below.)
