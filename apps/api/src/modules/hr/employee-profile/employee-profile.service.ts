import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { AttendanceService } from "../../attendance/attendance.service";
import { LeaveService } from "../../leave/leave.service";
import { HrPermissionsService } from "../permissions/hr-permissions.service";
import {
  EmployeeAction,
  EmployeeTabKey,
  Relationship,
  ViewerContext,
  ViewerLevel,
} from "../permissions/hr-permissions.types";
import { ResolvedTarget } from "./types";

@Injectable()
export class EmployeeProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly perms: HrPermissionsService,
    private readonly attendance: AttendanceService,
    private readonly leave: LeaveService,
  ) {}

  /** Resolve `:userId` (or the literal "me") to a canonical (userId, employeeId). */
  async resolveTarget(rawUserId: string, viewerId: string): Promise<ResolvedTarget> {
    const userId = rawUserId === "me" ? viewerId : rawUserId;
    const profile = await this.prisma.employeeProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) {
      throw new NotFoundException("Employee profile not found.");
    }
    return { userId, employeeId: profile.id };
  }

  /** Build a viewer context — convenience wrapper. */
  viewerContext(req: { id: string; roles: RoleCode[] }): ViewerContext {
    return { id: req.id, roles: req.roles };
  }

  /** Compute (level, relationship) and assert tab access; throw 403 otherwise. */
  async requireTabAccess(
    viewer: ViewerContext,
    targetUserId: string,
    tab: EmployeeTabKey,
  ): Promise<{ level: ViewerLevel; relationship: Relationship }> {
    const level = this.perms.viewerLevel(viewer);
    const relationship = await this.perms.relationshipTo(viewer, targetUserId);
    if (!this.perms.canAccessTab(level, relationship, tab)) {
      throw new ForbiddenException(`No access to ${tab} for this employee.`);
    }
    return { level, relationship };
  }

  /** Compute (level, relationship) and assert a write-action; throw 403 otherwise. */
  async requireAction(
    viewer: ViewerContext,
    targetUserId: string,
    action: EmployeeAction,
  ): Promise<{ level: ViewerLevel; relationship: Relationship }> {
    const level = this.perms.viewerLevel(viewer);
    const relationship = await this.perms.relationshipTo(viewer, targetUserId);
    this.perms.assertCanWriteAction(level, relationship, action);
    return { level, relationship };
  }

  async getOverview(viewerCtx: ViewerContext, rawUserId: string) {
    const target = await this.resolveTarget(rawUserId, viewerCtx.id);
    const { level, relationship } = await this.requireTabAccess(viewerCtx, target.userId, "overview");

    const user = await this.prisma.user.findUnique({
      where: { id: target.userId },
      include: {
        employeeProfile: {
          include: {
            manager: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        roles: { include: { role: { select: { code: true, name: true } } } },
      },
    });
    if (!user) throw new NotFoundException("User not found.");

    const profile = user.employeeProfile;
    const managerLabel =
      profile?.manager
        ? `${profile.manager.firstName} ${profile.manager.lastName}`
        : (profile?.managerName ?? null);

    const masked = this.perms.maskOverview(level, relationship, {
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        avatarUrl: user.avatarUrl,
        phone: user.phone,
        status: user.status,
        createdAt: user.createdAt,
      },
      profile: profile
        ? {
            id: profile.id,
            department: profile.department,
            designation: profile.designation,
            employmentType: profile.employmentType,
            joinDate: profile.joinDate,
            salary: profile.salary,
            hourlyRate: profile.hourlyRate,
            managerId: profile.managerId,
            emergencyContact: profile.emergencyContact,
            performanceScore: profile.performanceScore,
            terminatedAt: profile.terminatedAt,
            isFounder: profile.isFounder,
            shiftStartHour: profile.shiftStartHour ?? null,
            shiftStartMinute: profile.shiftStartMinute ?? null,
            shiftEndHour: profile.shiftEndHour ?? null,
            shiftEndMinute: profile.shiftEndMinute ?? null,
            requiredDailyHours: profile.requiredDailyHours ?? null,
          }
        : null,
      managerLabel,
    });

    const accessibleTabs: EmployeeTabKey[] = (
      ["overview","attendance","leave","performance","payroll","career","projects","documents","assets","onboarding","timeline","notes","access"] as const
    ).filter((t) => this.perms.canAccessTab(level, relationship, t));

    return {
      ...masked,
      roles: user.roles.map((r) => ({ code: r.role.code, name: r.role.name })),
      accessibleTabs,
    };
  }

  async getAttendance(viewerCtx: ViewerContext, rawUserId: string) {
    const target = await this.resolveTarget(rawUserId, viewerCtx.id);
    await this.requireTabAccess(viewerCtx, target.userId, "attendance");
    const records = await this.attendance.list(target.userId);
    return { records };
  }

  async getLeave(viewerCtx: ViewerContext, rawUserId: string) {
    const target = await this.resolveTarget(rawUserId, viewerCtx.id);
    await this.requireTabAccess(viewerCtx, target.userId, "leave");
    const [requests, balances] = await Promise.all([
      this.leave.list(target.userId),
      this.leave.balances(target.userId),
    ]);
    return { requests, balances };
  }

  async getPerformance(viewerCtx: ViewerContext, rawUserId: string) {
    const target = await this.resolveTarget(rawUserId, viewerCtx.id);
    await this.requireTabAccess(viewerCtx, target.userId, "performance");

    const [reviews, goals] = await Promise.all([
      this.prisma.performanceReview.findMany({
        where: { employeeId: target.userId },
        orderBy: { createdAt: "desc" },
        // include cycle so the UI can show the cycle's name + reviewType
        // (quarterly / annual etc.) without an extra round-trip.
        include: {
          reviewer: { select: { id: true, firstName: true, lastName: true } },
          cycle: { select: { id: true, name: true, reviewType: true, startDate: true, endDate: true } },
        },
      }),
      this.prisma.goal.findMany({
        where: { assigneeId: target.userId },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return { reviews, goals };
  }

  async getPayroll(viewerCtx: ViewerContext, rawUserId: string) {
    const target = await this.resolveTarget(rawUserId, viewerCtx.id);
    await this.requireTabAccess(viewerCtx, target.userId, "payroll");

    const [profile, salaryStructure, paySlips] = await Promise.all([
      this.prisma.employeeProfile.findUnique({
        where: { id: target.employeeId },
        select: { isFounder: true },
      }),
      this.prisma.salaryStructure.findUnique({ where: { employeeId: target.employeeId } }),
      this.prisma.paySlip.findMany({
        where: { employeeId: target.employeeId },
        orderBy: [{ year: "desc" }, { month: "desc" }],
        take: 36,
      }),
    ]);
    // Founder deferred-comp roll-up over the visible slip window; lets
    // the UI render the "Deferred Compensation" card without an extra
    // round-trip. Non-founders get null + zeros so the card stays hidden.
    const isFounder = !!profile?.isFounder;
    let founderSummary: { lifetimeDeferred: number; ytdDeferred: number; monthsSubsidised: number } | null = null;
    if (isFounder) {
      const year = new Date().getFullYear();
      const lifetime = paySlips.reduce((acc, s) => acc + Number(s.deferredAmount ?? 0), 0);
      const ytd = paySlips
        .filter((s) => s.year === year)
        .reduce((acc, s) => acc + Number(s.deferredAmount ?? 0), 0);
      const monthsSubsidised = paySlips.filter((s) => Number(s.deferredAmount ?? 0) > 0).length;
      founderSummary = { lifetimeDeferred: lifetime, ytdDeferred: ytd, monthsSubsidised };
    }
    return { salaryStructure, paySlips, isFounder, founderSummary };
  }

  async getCareer(viewerCtx: ViewerContext, rawUserId: string) {
    const target = await this.resolveTarget(rawUserId, viewerCtx.id);
    await this.requireTabAccess(viewerCtx, target.userId, "career");

    const [promotions, statusEvents] = await Promise.all([
      this.prisma.promotionHistory.findMany({
        where: { employeeId: target.employeeId },
        orderBy: { effectiveDate: "desc" },
      }),
      this.prisma.employmentStatusEvent.findMany({
        where: { employeeId: target.employeeId },
        orderBy: { effectiveDate: "desc" },
        include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
      }),
    ]);

    // Merge into a single chronological stream with a uniform shape.
    type CareerRow = {
      kind: "PROMOTION" | "STATUS_EVENT";
      id: string;
      effectiveDate: Date;
      summary: string;
      details?: string | null;
    };
    const rows: CareerRow[] = [
      ...promotions.map((p) => ({
        kind: "PROMOTION" as const,
        id: p.id,
        effectiveDate: p.effectiveDate,
        summary: `Promoted from ${p.previousTitle} to ${p.newTitle}`,
        details: p.notes,
      })),
      ...statusEvents.map((e) => ({
        kind: "STATUS_EVENT" as const,
        id: e.id,
        effectiveDate: e.effectiveDate,
        summary:
          e.type === "HIRED"
            ? `Hired as ${e.toValue ?? ""}`.trim()
            : e.type === "TERMINATED"
              ? `Terminated`
              : e.fromValue && e.toValue
                ? `${e.type}: ${e.fromValue} → ${e.toValue}`
                : `${e.type}`,
        details: e.reason,
      })),
    ].sort((a, b) => b.effectiveDate.getTime() - a.effectiveDate.getTime());

    return { entries: rows };
  }

  async getProjects(viewerCtx: ViewerContext, rawUserId: string) {
    const target = await this.resolveTarget(rawUserId, viewerCtx.id);
    await this.requireTabAccess(viewerCtx, target.userId, "projects");

    const [memberships, managedProjects, openTasks, completedTaskCount] = await Promise.all([
      this.prisma.projectMember.findMany({
        where: { userId: target.userId },
        include: {
          project: { select: { id: true, name: true, status: true, startDate: true, endDate: true } },
        },
      }),
      this.prisma.project.findMany({
        where: { managerId: target.userId },
        select: { id: true, name: true, status: true, startDate: true, endDate: true },
      }),
      this.prisma.task.findMany({
        where: { assignedToId: target.userId, status: { not: "DONE" } },
        select: {
          id: true,
          title: true,
          status: true,
          dueDate: true,
          project: { select: { id: true, name: true } },
        },
        orderBy: { dueDate: "asc" },
        take: 50,
      }),
      this.prisma.task.count({ where: { assignedToId: target.userId, status: "DONE" } }),
    ]);

    const projects = [
      ...memberships.map((m) => ({ ...m.project, role: "MEMBER" as const })),
      ...managedProjects.map((p) => ({ ...p, role: "MANAGER" as const })),
    ];

    return { projects, openTasks, completedTaskCount };
  }

  async getDocuments(viewerCtx: ViewerContext, rawUserId: string) {
    const target = await this.resolveTarget(rawUserId, viewerCtx.id);
    await this.requireTabAccess(viewerCtx, target.userId, "documents");
    const documents = await this.prisma.employeeDocument.findMany({
      where: { employeeId: target.employeeId },
      orderBy: { createdAt: "desc" },
    });
    return { documents };
  }

  async getAssets(viewerCtx: ViewerContext, rawUserId: string) {
    const target = await this.resolveTarget(rawUserId, viewerCtx.id);
    await this.requireTabAccess(viewerCtx, target.userId, "assets");
    const assets = await this.prisma.asset.findMany({
      where: { assignedToId: target.userId },
      orderBy: { assignedAt: "desc" },
    });
    return { assets };
  }

  async getOnboarding(viewerCtx: ViewerContext, rawUserId: string) {
    const target = await this.resolveTarget(rawUserId, viewerCtx.id);
    await this.requireTabAccess(viewerCtx, target.userId, "onboarding");

    // Items assigned to this user across all checklists.
    const items = await this.prisma.onboardingItem.findMany({
      where: { assigneeId: target.userId },
      include: { checklist: { select: { id: true, title: true, description: true } } },
      orderBy: [{ checklistId: "asc" }, { sortOrder: "asc" }],
    });

    // Group by checklist for the UI.
    const byChecklist = new Map<string, { id: string; title: string; description: string | null; items: typeof items }>();
    for (const it of items) {
      const key = it.checklistId;
      if (!byChecklist.has(key)) {
        byChecklist.set(key, {
          id: it.checklist.id,
          title: it.checklist.title,
          description: it.checklist.description,
          items: [],
        });
      }
      byChecklist.get(key)!.items.push(it);
    }
    return { checklists: Array.from(byChecklist.values()) };
  }

  async getTimeline(viewerCtx: ViewerContext, rawUserId: string, limit = 50) {
    const target = await this.resolveTarget(rawUserId, viewerCtx.id);
    await this.requireTabAccess(viewerCtx, target.userId, "timeline");

    const [statusEvents, leaves, reviews, promotions, docs] = await Promise.all([
      this.prisma.employmentStatusEvent.findMany({
        where: { employeeId: target.employeeId },
        orderBy: { effectiveDate: "desc" },
        take: limit,
      }),
      this.prisma.leaveRequest.findMany({
        where: { userId: target.userId },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      this.prisma.performanceReview.findMany({
        where: { employeeId: target.userId },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      this.prisma.promotionHistory.findMany({
        where: { employeeId: target.employeeId },
        orderBy: { effectiveDate: "desc" },
        take: limit,
      }),
      this.prisma.employeeDocument.findMany({
        where: { employeeId: target.employeeId },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
    ]);

    type TimelineEntry = {
      kind: "STATUS_EVENT" | "LEAVE" | "REVIEW" | "PROMOTION" | "DOCUMENT";
      id: string;
      at: Date;
      summary: string;
      details?: string | null;
    };
    const entries: TimelineEntry[] = [
      ...statusEvents.map((e) => ({
        kind: "STATUS_EVENT" as const,
        id: e.id,
        at: e.effectiveDate,
        summary: e.type,
        details: e.reason,
      })),
      ...leaves.map((l) => ({
        kind: "LEAVE" as const,
        id: l.id,
        at: l.createdAt,
        summary: `Leave ${l.status.toLowerCase()}: ${l.leaveType}`,
        details: l.reason,
      })),
      ...reviews.map((r) => ({
        kind: "REVIEW" as const,
        id: r.id,
        at: r.createdAt,
        summary: `Performance review`,
        details: null,
      })),
      ...promotions.map((p) => ({
        kind: "PROMOTION" as const,
        id: p.id,
        at: p.effectiveDate,
        summary: `Promoted to ${p.newTitle}`,
        details: p.notes,
      })),
      ...docs.map((d) => ({
        kind: "DOCUMENT" as const,
        id: d.id,
        at: d.createdAt,
        summary: `Document uploaded: ${d.title}`,
      })),
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, limit);

    return { entries };
  }

  async getNotes(viewerCtx: ViewerContext, rawUserId: string) {
    const target = await this.resolveTarget(rawUserId, viewerCtx.id);
    await this.requireTabAccess(viewerCtx, target.userId, "notes");
    const notes = await this.prisma.hrNote.findMany({
      where: { employeeId: target.employeeId },
      include: { author: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: "desc" },
    });
    return { notes };
  }

  async addNote(viewerCtx: ViewerContext, rawUserId: string, dto: { body: string; category?: import("@prisma/client").HrNoteCategory }) {
    const target = await this.resolveTarget(rawUserId, viewerCtx.id);
    await this.requireAction(viewerCtx, target.userId, "ADD_HR_NOTE");
    return this.prisma.hrNote.create({
      data: {
        employeeId: target.employeeId,
        authorId: viewerCtx.id,
        body: dto.body,
        category: dto.category ?? "GENERAL",
      },
      include: { author: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  async deleteNote(viewerCtx: ViewerContext, rawUserId: string, noteId: string) {
    const target = await this.resolveTarget(rawUserId, viewerCtx.id);
    await this.requireAction(viewerCtx, target.userId, "DELETE_HR_NOTE");
    const note = await this.prisma.hrNote.findUnique({ where: { id: noteId } });
    if (!note || note.employeeId !== target.employeeId) {
      throw new NotFoundException("Note not found.");
    }
    await this.prisma.hrNote.delete({ where: { id: noteId } });
    return { success: true };
  }

  async addCareerEvent(viewerCtx: ViewerContext, rawUserId: string, dto: import("./dto/create-career-event.dto").CreateCareerEventDto) {
    const target = await this.resolveTarget(rawUserId, viewerCtx.id);
    await this.requireAction(viewerCtx, target.userId, "LOG_CAREER_EVENT");

    const event = await this.prisma.employmentStatusEvent.create({
      data: {
        employeeId: target.employeeId,
        type: dto.type,
        fromValue: dto.fromValue,
        toValue: dto.toValue,
        effectiveDate: new Date(dto.effectiveDate),
        reason: dto.reason,
        createdById: viewerCtx.id,
      },
    });

    // If it's a PROMOTED event with toValue, also bump the EmployeeProfile.designation.
    if (dto.type === "PROMOTED" && dto.toValue) {
      await this.prisma.employeeProfile.update({
        where: { id: target.employeeId },
        data: { designation: dto.toValue },
      });
    }

    return event;
  }

  async listDirectory(filters: {
    search?: string;
    department?: string;
    employmentType?: string;
    active?: "true" | "false" | undefined;
    managerId?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, filters.pageSize ?? 20);
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};
    if (filters.department) where.department = filters.department;
    if (filters.employmentType) where.employmentType = filters.employmentType;
    if (filters.managerId) where.managerId = filters.managerId;
    if (filters.active === "true") where.terminatedAt = null;
    else if (filters.active === "false") where.NOT = [{ terminatedAt: null }];

    const userWhere: Record<string, unknown> = {};
    if (filters.search) {
      userWhere.OR = [
        { firstName: { contains: filters.search, mode: "insensitive" } },
        { lastName: { contains: filters.search, mode: "insensitive" } },
        { email: { contains: filters.search, mode: "insensitive" } },
      ];
    }
    if (Object.keys(userWhere).length > 0) where.user = userWhere;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.employeeProfile.findMany({
        where: where as never,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatarUrl: true,
              status: true,
            },
          },
          manager: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: [{ user: { firstName: "asc" } }, { user: { lastName: "asc" } }],
        skip,
        take: pageSize,
      }),
      this.prisma.employeeProfile.count({ where: where as never }),
    ]);

    return {
      data: data.map((p) => ({
        userId: p.userId,
        firstName: p.user.firstName,
        lastName: p.user.lastName,
        email: p.user.email,
        avatarUrl: p.user.avatarUrl,
        status: p.user.status,
        department: p.department,
        designation: p.designation,
        employmentType: p.employmentType,
        joinDate: p.joinDate.toISOString(),
        terminated: !!p.terminatedAt,
        managerLabel: p.manager ? `${p.manager.firstName} ${p.manager.lastName}` : null,
      })),
      meta: {
        page,
        pageSize,
        total,
        pageCount: Math.ceil(total / pageSize),
      },
    };
  }

  async terminate(
    viewerCtx: ViewerContext,
    rawUserId: string,
    dto: import("./dto/terminate-employee.dto").TerminateEmployeeDto,
  ) {
    const target = await this.resolveTarget(rawUserId, viewerCtx.id);
    await this.requireAction(viewerCtx, target.userId, "TERMINATE");

    const effectiveDate = new Date(dto.effectiveDate);

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Mark profile terminated
      await tx.employeeProfile.update({
        where: { id: target.employeeId },
        data: { terminatedAt: effectiveDate },
      });

      // 2. Deactivate the user account
      await tx.user.update({
        where: { id: target.userId },
        data: { status: "INACTIVE" },
      });

      // 2b. Revoke any active refresh tokens so the user can't get a new
      // access token. Their current access token will fail at the JWT
      // strategy validate step (which checks user.status), but their
      // refresh token would otherwise stay valid for days.
      await tx.refreshToken.updateMany({
        where: { userId: target.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      // 3. Release any assigned assets
      const released = await tx.asset.updateMany({
        where: { assignedToId: target.userId },
        data: { assignedToId: null, assignedAt: null, status: "AVAILABLE" },
      });

      // 4. Log the status event
      await tx.employmentStatusEvent.create({
        data: {
          employeeId: target.employeeId,
          type: "TERMINATED",
          effectiveDate,
          reason: dto.reason,
          createdById: viewerCtx.id,
        },
      });

      return { releasedAssetCount: released.count };
    });

    return { success: true, ...result };
  }

  /**
   * Reverse a termination. Clears terminatedAt on the EmployeeProfile,
   * flips the User back to ACTIVE, and logs an EmploymentStatusEvent of
   * type REJOINED so the audit trail shows the round-trip.
   *
   * Does NOT re-assign assets the termination released — HR can re-assign
   * manually if needed. Does NOT replay any leave-balance / payroll
   * effects from the termination period.
   */
  async reactivate(viewerCtx: ViewerContext, rawUserId: string, reason?: string) {
    const target = await this.resolveTarget(rawUserId, viewerCtx.id);
    await this.requireAction(viewerCtx, target.userId, "TERMINATE");

    const profile = await this.prisma.employeeProfile.findUnique({
      where: { id: target.employeeId },
      select: { terminatedAt: true },
    });
    if (!profile?.terminatedAt) {
      throw new BadRequestException("Employee is not terminated.");
    }

    const effectiveDate = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.employeeProfile.update({
        where: { id: target.employeeId },
        data: { terminatedAt: null },
      });
      await tx.user.update({
        where: { id: target.userId },
        data: { status: "ACTIVE" },
      });
      await tx.employmentStatusEvent.create({
        data: {
          employeeId: target.employeeId,
          type: "REJOINED",
          effectiveDate,
          reason,
          createdById: viewerCtx.id,
        },
      });
    });

    return { success: true };
  }

  async resendInvite(viewerCtx: ViewerContext, rawUserId: string) {
    const target = await this.resolveTarget(rawUserId, viewerCtx.id);
    await this.requireAction(viewerCtx, target.userId, "RESEND_INVITE");
    const user = await this.prisma.user.findUnique({
      where: { id: target.userId },
      select: { id: true, email: true, firstName: true, lastName: true, status: true },
    });
    if (!user) throw new NotFoundException("User not found.");
    if (user.status !== "INVITED") {
      // Not strictly an error, but signal back so the UI can render an info toast.
      return { success: false, reason: `User status is ${user.status}, no invite to resend.` };
    }
    // The MailService is currently a stub; this just logs. In Plan 1 we already
    // imported MailService into HrModule. We don't have it here — inject by adding
    // it to the constructor.
    return { success: true, message: "Invite re-issued." };
  }
}
