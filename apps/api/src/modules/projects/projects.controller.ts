import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { PaginationDto } from "../../common/pagination/pagination.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { isAdminRole } from "../../common/scope/resolve-scope.util";
import { CreateProjectDto } from "./dto/create-project.dto";
import { ProjectsService } from "./projects.service";
import { PaymentMilestonesService } from "./payment-milestones.service";
import { AiService } from "../ai/ai.service";

// Fields that are only visible to admins/PMs/finance — NEVER to plain employees.
const SENSITIVE_PROJECT_FIELDS = ["budget", "client", "invoices"] as const;

function scrubProjectForEmployee<T extends Record<string, unknown>>(project: T): T {
  const copy = { ...project };
  for (const key of SENSITIVE_PROJECT_FIELDS) {
    if (key in copy) delete (copy as Record<string, unknown>)[key];
  }
  return copy;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("projects")
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly paymentMilestones: PaymentMilestonesService,
    private readonly ai: AiService,
  ) {}

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER, RoleCode.FINANCE_MANAGER, RoleCode.EMPLOYEE, RoleCode.CLIENT)
  @Get()
  async findAll(
    @Query() query: PaginationDto,
    @CurrentUser() user: { id: string; roles?: any },
  ) {
    const isFinance = user.roles?.some?.((r: any) => (typeof r === "string" ? r : r?.role?.code) === RoleCode.FINANCE_MANAGER);
    const isPrivileged = isAdminRole(user) || isFinance;

    // Plain employees only see projects they're a part of (member / manager / assigned a task).
    const result = await this.projectsService.findAll(query, {
      userId: user.id,
      restrict: !isPrivileged,
    });

    if (!isPrivileged) {
      return {
        ...result,
        data: result.data.map((p: any) => scrubProjectForEmployee(p)),
      };
    }
    return result;
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Post()
  create(@Body() dto: CreateProjectDto, @CurrentUser() user: { id: string }) {
    return this.projectsService.create(dto, user.id);
  }

  // ── Portfolio summary (must be before :id so Nest doesn't treat "portfolio" as an id) ──
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER, RoleCode.FINANCE_MANAGER)
  @Get("portfolio")
  async portfolio(@CurrentUser() user: { id: string; roles?: any }) {
    const roles = Array.isArray(user.roles) ? user.roles : [];
    const isFinance = roles.some((r: any) =>
      (typeof r === "string" ? r : r?.role?.code) === RoleCode.FINANCE_MANAGER,
    );
    const rows = await this.projectsService.portfolio({
      id: user.id,
      isAdmin: isAdminRole(user),
      isFinance,
    });
    // Strip budget for non-finance, non-admin callers as a belt-and-braces.
    if (!isAdminRole(user) && !isFinance) {
      return rows.map((r: any) => {
        const { budget: _budget, ...rest } = r;
        return rest;
      });
    }
    return rows;
  }

  // ── Burn rate ──
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.FINANCE_MANAGER)
  @Get(":id/burn-rate")
  burnRate(
    @Param("id") id: string,
    @CurrentUser() user: { id: string; roles?: any },
  ) {
    const roles = Array.isArray(user.roles) ? user.roles : [];
    const isFinance = roles.some((r: any) =>
      (typeof r === "string" ? r : r?.role?.code) === RoleCode.FINANCE_MANAGER,
    );
    const canSeeFinance = isAdminRole(user) || isFinance;
    return this.projectsService.burnRate(id, canSeeFinance);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.FINANCE_MANAGER)
  @Get(":id/profit-loss")
  profitLoss(
    @Param("id") id: string,
    @CurrentUser() user: { id: string; roles?: any },
  ) {
    const roles = Array.isArray(user.roles) ? user.roles : [];
    const isFinance = roles.some((r: any) =>
      (typeof r === "string" ? r : r?.role?.code) === RoleCode.FINANCE_MANAGER,
    );
    const canSeeFinance = isAdminRole(user) || isFinance;
    return this.projectsService.profitLoss(id, canSeeFinance);
  }

  // ── AI: create a brand-new project with a generated plan in one shot ──
  // MUST sit above the :id wildcard routes so future GET additions can't
  // accidentally shadow it. The frontend's "Create with AI" entry uses
  // this. We create the empty project shell, run the planner against
  // the freshly-pulled member roster, and return both the project id
  // and the plan preview for the user to review/edit. They commit by
  // calling ai-apply-plan.
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Post("ai-create")
  aiCreate(
    @Body() body: CreateProjectDto & { requirement: string; hourlyRate?: number },
    @CurrentUser() user: { id: string },
  ) {
    return this.projectsService.createWithAi(body, user.id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER, RoleCode.FINANCE_MANAGER, RoleCode.EMPLOYEE, RoleCode.CLIENT)
  @Get(":id")
  async findOne(
    @Param("id") id: string,
    @CurrentUser() user: { id: string; roles?: any },
  ) {
    const isFinance = user.roles?.some?.((r: any) => (typeof r === "string" ? r : r?.role?.code) === RoleCode.FINANCE_MANAGER);
    const isPrivileged = isAdminRole(user) || isFinance;

    // Employees / clients cannot access projects they aren't part of.
    if (!isPrivileged) {
      const allowed = await this.projectsService.userHasProjectAccess(id, user.id);
      if (!allowed) throw new ForbiddenException("You don't have access to this project.");
    }

    const project = await this.projectsService.findOne(id);
    if (!isPrivileged) return scrubProjectForEmployee(project as any);
    return project;
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: Partial<CreateProjectDto>,
    @CurrentUser() user: { id: string },
  ) {
    return this.projectsService.update(id, dto, user.id);
  }

  // Deletion is restricted to SUPER_ADMIN. (Admins can edit but not delete.)
  @Roles(RoleCode.SUPER_ADMIN)
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.projectsService.remove(id);
  }

  // ClickUp-style per-person workload box view
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER, RoleCode.EMPLOYEE)
  @Get(":id/workload")
  workload(@Param("id") id: string) {
    return this.projectsService.workload(id);
  }

  // ── Clone a project ──
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Post(":id/clone")
  clone(
    @Param("id") id: string,
    @Body()
    body: {
      name: string;
      cloneMembers?: boolean;
      cloneStatuses?: boolean;
      cloneLabels?: boolean;
      cloneRecurring?: boolean;
      cloneMilestones?: boolean;
    },
    @CurrentUser() user: { id: string },
  ) {
    return this.projectsService.clone(id, body, user.id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Post(":id/milestones")
  createMilestone(@Param("id") projectId: string, @Body() dto: { title: string; description?: string; dueDate?: string; status?: string }) {
    return this.projectsService.createMilestone(projectId, dto);
  }

  // ── Rebalance: redistribute open tasks so no one is over-committed
  //    and unassigned tasks get an owner. Pure code, no AI call.
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Post(":id/rebalance-workload")
  rebalanceWorkload(@Param("id") projectId: string) {
    return this.projectsService.rebalanceWorkload(projectId);
  }

  // ── Backfill: build a proposal from this project's existing
  //    milestones/tasks/budget. No AI call — pure data assembly.
  //    Used by the "Generate proposal" button on the project's
  //    Proposals tab when the project doesn't have one yet.
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.FINANCE_MANAGER)
  @Post(":id/generate-proposal")
  generateProposalFromProject(
    @Param("id") projectId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.projectsService.createProposalFromProject(projectId, user.id);
  }

  // ── AI: generate a project plan (preview only — does not save) ──
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Post(":id/ai-generate-plan")
  async aiGeneratePlan(
    @Param("id") projectId: string,
    @Body() body: { requirement: string },
  ) {
    const { project, team } = await this.projectsService.aiPlanContext(projectId);
    const plan = await this.ai.generateProjectPlan({
      projectName: project.name,
      requirement: body.requirement ?? "",
      budget: project.budget != null ? Number(project.budget) : undefined,
      startDate: project.startDate ? project.startDate.toISOString().slice(0, 10) : undefined,
      endDate: project.endDate ? project.endDate.toISOString().slice(0, 10) : undefined,
      team: team.map((m) => ({
        id: m.id,
        name: m.name,
        role: m.role,
        existingCommittedHours: m.existingCommittedHours,
        existingOpenTasks: m.existingOpenTasks,
      })),
    });
    return { plan, team };
  }

  // ── AI: apply a (possibly user-edited) plan, creating real records ──
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Post(":id/ai-apply-plan")
  aiApplyPlan(
    @Param("id") projectId: string,
    @Body()
    body: {
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
      requirement?: string;
      hourlyRate?: number;
      budget?: number | null;
      autoFinalize?: boolean;
    },
    @CurrentUser() user: { id: string },
  ) {
    return this.projectsService.applyAiPlan(projectId, body, user.id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Patch(":projectId/milestones/:milestoneId")
  updateMilestone(
    @Param("projectId") projectId: string,
    @Param("milestoneId") milestoneId: string,
    @Body() dto: { title?: string; description?: string; dueDate?: string; status?: string },
  ) {
    return this.projectsService.updateMilestone(projectId, milestoneId, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Delete(":projectId/milestones/:milestoneId")
  removeMilestone(@Param("projectId") projectId: string, @Param("milestoneId") milestoneId: string) {
    return this.projectsService.removeMilestone(projectId, milestoneId);
  }

  // ── Payment milestones (50/30/20-style schedule that drives invoice generation) ──

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.FINANCE_MANAGER)
  @Get(":id/payment-milestones")
  listPaymentMilestones(@Param("id") projectId: string) {
    return this.paymentMilestones.list(projectId);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.FINANCE_MANAGER)
  @Post(":id/payment-milestones")
  createPaymentMilestone(
    @Param("id") projectId: string,
    @Body() dto: { label: string; percentage: number; isExtra?: boolean; amount?: number; sortOrder?: number; dueDate?: string; notes?: string },
  ) {
    return this.paymentMilestones.create(projectId, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.FINANCE_MANAGER)
  @Patch(":projectId/payment-milestones/:milestoneId")
  updatePaymentMilestone(
    @Param("projectId") projectId: string,
    @Param("milestoneId") milestoneId: string,
    @Body() dto: { label?: string; percentage?: number; amount?: number | null; sortOrder?: number; dueDate?: string | null; notes?: string | null; status?: any },
  ) {
    return this.paymentMilestones.update(projectId, milestoneId, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.FINANCE_MANAGER)
  @Delete(":projectId/payment-milestones/:milestoneId")
  removePaymentMilestone(
    @Param("projectId") projectId: string,
    @Param("milestoneId") milestoneId: string,
  ) {
    return this.paymentMilestones.remove(projectId, milestoneId);
  }

  /** Generate the invoice for this milestone. Idempotent on PENDING — fails if already INVOICED/PAID. */
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.FINANCE_MANAGER)
  @Post(":projectId/payment-milestones/:milestoneId/generate-invoice")
  generateMilestoneInvoice(
    @Param("projectId") projectId: string,
    @Param("milestoneId") milestoneId: string,
    @Body() body: { dueDate?: string },
    @CurrentUser() user: { id: string },
  ) {
    return this.paymentMilestones.generateInvoice(projectId, milestoneId, user.id, body ?? {});
  }

  /**
   * Void the stale invoice on a milestone and generate a fresh one at
   * the current expected (budget × pct). Used when the percentage or
   * budget changed after the original invoice was issued and the
   * milestone now shows the "Issued amount differs" warning.
   */
  @Post(":projectId/payment-milestones/:milestoneId/reissue-invoice")
  reissueMilestoneInvoice(
    @Param("projectId") projectId: string,
    @Param("milestoneId") milestoneId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.paymentMilestones.reissue(projectId, milestoneId, user.id);
  }

  /**
   * Recompute the milestone's percentage so it matches what was
   * actually issued on the invoice. Used to clean up paid milestones
   * where the percentage was edited after invoicing.
   */
  @Post(":projectId/payment-milestones/:milestoneId/snap-to-invoice")
  snapMilestoneToInvoice(
    @Param("projectId") projectId: string,
    @Param("milestoneId") milestoneId: string,
  ) {
    return this.paymentMilestones.snapToInvoice(projectId, milestoneId);
  }
}
