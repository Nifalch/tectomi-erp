import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { PaginationDto } from "../../common/pagination/pagination.dto";
import { isAdminRole, resolveScopedUserId } from "../../common/scope/resolve-scope.util";
import { CreateTimeEntryDto } from "./dto/create-time-entry.dto";
import { TimeService } from "./time.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("time-entries")
export class TimeController {
  constructor(private readonly timeService: TimeService) {}

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.EMPLOYEE)
  @Get()
  findAll(
    @CurrentUser() user: { id: string; roles?: any },
    @Query() query: PaginationDto & { userId?: string; from?: string; to?: string },
  ) {
    // Admin with no userId param == "show everyone". Without this branch
    // resolveScopedUserId would silently scope to the admin's own id and
    // the View-as "Everyone" option would show only the admin's entries.
    if (!query.userId && isAdminRole(user)) {
      return this.timeService.findAll(undefined, query);
    }
    const scopedId = resolveScopedUserId(user, query.userId);
    return this.timeService.findAll(scopedId, query);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.EMPLOYEE)
  @Post()
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateTimeEntryDto) {
    return this.timeService.create(user.id, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.EMPLOYEE)
  @Delete(":id")
  remove(@Param("id") id: string, @CurrentUser() user: { id: string }) {
    return this.timeService.remove(id, user.id);
  }

  // ── Timer (ClickUp-style start/stop per task) ──

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER, RoleCode.EMPLOYEE)
  @Get("active")
  getActive(@CurrentUser() user: { id: string }) {
    return this.timeService.getActive(user.id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER, RoleCode.EMPLOYEE)
  @Post("start")
  start(
    @CurrentUser() user: { id: string },
    @Body() body: { taskId?: string; projectId?: string; notes?: string },
  ) {
    return this.timeService.start(user.id, body);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER, RoleCode.EMPLOYEE)
  @Post("stop")
  stop(
    @CurrentUser() user: { id: string; roles?: RoleCode[] },
    @Body() body: { notes?: string },
  ) {
    return this.timeService.stopActive(user.id, body?.notes, user.roles);
  }

  // ── Approval workflow ──
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER)
  @Get("pending-approval")
  pendingApproval(@Query() query: PaginationDto) {
    return this.timeService.pendingApproval(query);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER)
  @Post(":id/approve")
  approve(@Param("id") id: string, @CurrentUser() user: { id: string }) {
    return this.timeService.approve(id, user.id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER)
  @Post(":id/reject")
  reject(
    @Param("id") id: string,
    @CurrentUser() user: { id: string },
    @Body() body: { reason: string },
  ) {
    return this.timeService.reject(id, user.id, body?.reason);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER)
  @Post("bulk-approve")
  bulkApprove(@CurrentUser() user: { id: string }, @Body() body: { ids: string[] }) {
    return this.timeService.bulkApprove(body?.ids ?? [], user.id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER)
  @Post("bulk-reject")
  bulkReject(
    @CurrentUser() user: { id: string },
    @Body() body: { ids: string[]; reason?: string },
  ) {
    return this.timeService.bulkReject(body?.ids ?? [], user.id, body?.reason);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER, RoleCode.EMPLOYEE)
  @Get("task/:taskId/summary")
  taskSummary(@Param("taskId") taskId: string) {
    return this.timeService.taskSummary(taskId);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER, RoleCode.FINANCE_MANAGER, RoleCode.EMPLOYEE)
  @Get("project/:projectId/summary")
  projectSummary(@Param("projectId") projectId: string) {
    return this.timeService.projectSummary(projectId);
  }

  // MUST sit above `@Get("performance/:userId")` — otherwise the dynamic
  // route swallows `/performance/me` and tries to look up a user with id
  // literally "me".
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER, RoleCode.EMPLOYEE)
  @Get("performance/me")
  myPerformance(
    @CurrentUser() user: { id: string },
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.timeService.userPerformance(user.id, from, to);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER, RoleCode.EMPLOYEE)
  @Get("performance/:userId")
  userPerformance(
    @Param("userId") userId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.timeService.userPerformance(userId, from, to);
  }
}
