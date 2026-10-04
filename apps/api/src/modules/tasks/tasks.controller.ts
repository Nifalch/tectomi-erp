import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { RoleCode } from "@prisma/client";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { PaginationDto } from "../../common/pagination/pagination.dto";
import { CreateTaskCommentDto, CreateTaskDto, UpdateTaskDto } from "./dto/create-task.dto";
import { TasksService } from "./tasks.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("tasks")
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER, RoleCode.EMPLOYEE)
  @Get()
  findAll(
    @Query() query: PaginationDto & { userId?: string },
    // JwtStrategy.validate() returns `roles: RoleCode[]` (flat array of strings),
    // NOT `Array<{ role: { code } }>`. Keep the typing accurate so the
    // role check actually works — otherwise admins silently see an empty board.
    @CurrentUser() user: { id: string; roles: RoleCode[] },
  ) {
    const roles = user.roles ?? [];
    const isAdmin = roles.some(
      (c) =>
        c === RoleCode.SUPER_ADMIN ||
        c === RoleCode.ADMIN ||
        c === RoleCode.PROJECT_MANAGER ||
        c === RoleCode.HR_MANAGER,
    );

    // Admins may view any employee's tasks via ?userId=xxx
    if (isAdmin && query.userId) {
      return this.tasksService.findByAssignee(query.userId, query, query.projectId);
    }
    // Admins without a filter see every task in the system (or the project scope).
    if (isAdmin) {
      return this.tasksService.findAll(query, query.projectId);
    }
    // Plain employees see only tasks assigned to them.
    return this.tasksService.findByAssignee(user.id, query, query.projectId);
  }

  // Allow EMPLOYEE to create tasks too
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.EMPLOYEE)
  @Post()
  create(
    @Body() dto: CreateTaskDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.tasksService.create(dto, user.id);
  }

  // ── CSV export (must be declared before @Get(":id") so Nest doesn't match "export" as an id) ──
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER, RoleCode.EMPLOYEE)
  @Get("export/csv")
  async exportCsv(@Query("projectId") projectId: string, @Res() res: Response) {
    const { csv, filename } = await this.tasksService.exportCsv(projectId);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER, RoleCode.EMPLOYEE)
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.tasksService.findOne(id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.EMPLOYEE)
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.tasksService.update(id, dto, user.id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.EMPLOYEE)
  @Post(":id/comments")
  addComment(
    @Param("id") taskId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateTaskCommentDto,
  ) {
    return this.tasksService.addComment(taskId, user.id, dto);
  }

  // ── Mentionable users for a task ──
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER, RoleCode.EMPLOYEE)
  @Get(":id/mentionable-users")
  mentionableUsers(@Param("id") id: string) {
    return this.tasksService.mentionableUsers(id);
  }

  // ── History / audit trail ──
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER, RoleCode.EMPLOYEE)
  @Get(":id/history")
  history(@Param("id") id: string) {
    return this.tasksService.getHistory(id);
  }

  // ── Clone / duplicate ──
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.EMPLOYEE)
  @Post(":id/clone")
  clone(@Param("id") id: string, @CurrentUser() user: { id: string }) {
    return this.tasksService.clone(id, user.id);
  }

  // ── Comment edit / delete ──
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.EMPLOYEE)
  @Patch("comments/:commentId")
  updateComment(
    @Param("commentId") commentId: string,
    @CurrentUser() user: { id: string },
    @Body() body: { content: string },
  ) {
    return this.tasksService.updateComment(commentId, user.id, body.content);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.EMPLOYEE)
  @Delete("comments/:commentId")
  removeComment(
    @Param("commentId") commentId: string,
    @CurrentUser() user: { id: string; roles: RoleCode[] },
  ) {
    const isAdmin = (user.roles ?? []).some(
      (r) => r === RoleCode.SUPER_ADMIN || r === RoleCode.ADMIN || r === RoleCode.PROJECT_MANAGER,
    );
    return this.tasksService.removeComment(commentId, user.id, isAdmin);
  }

  // ── Bulk operations ──
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Post("bulk-update")
  bulkUpdate(
    @Body()
    body: {
      ids: string[];
      status?: string;
      priority?: string;
      assignedToId?: string | null;
      sprintId?: string | null;
    },
    @CurrentUser() user: { id: string },
  ) {
    return this.tasksService.bulkUpdate(body, user.id);
  }

  @Roles(RoleCode.SUPER_ADMIN)
  @Post("bulk-delete")
  bulkDelete(@Body() body: { ids: string[] }, @CurrentUser() user: { id: string }) {
    return this.tasksService.bulkDelete(body.ids, user.id);
  }

  // Deletion is restricted to SUPER_ADMIN.
  @Roles(RoleCode.SUPER_ADMIN)
  @Delete(":id")
  remove(@Param("id") id: string, @CurrentUser() user: { id: string }) {
    return this.tasksService.remove(id, user.id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.EMPLOYEE)
  @Post(":id/dependencies")
  addDependency(@Param("id") id: string, @Body() body: { blockingId: string }) {
    return this.tasksService.addDependency(id, body.blockingId);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.EMPLOYEE)
  @Delete(":id/dependencies/:blockingId")
  removeDependency(@Param("id") id: string, @Param("blockingId") blockingId: string) {
    return this.tasksService.removeDependency(id, blockingId);
  }

  // ── Watchers ──
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER, RoleCode.EMPLOYEE)
  @Get(":id/watchers")
  listWatchers(@Param("id") id: string) {
    return this.tasksService.listWatchers(id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER, RoleCode.EMPLOYEE)
  @Post(":id/watch")
  watch(@Param("id") id: string, @CurrentUser() user: { id: string }) {
    return this.tasksService.watch(id, user.id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER, RoleCode.EMPLOYEE)
  @Delete(":id/watch")
  unwatch(@Param("id") id: string, @CurrentUser() user: { id: string }) {
    return this.tasksService.unwatch(id, user.id);
  }

  // ── Admin: run due-soon reminders (for cron) ──
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  @Post("run-reminders")
  runReminders() {
    return this.tasksService.runDueReminders();
  }

  // ── Estimate vs actual ──
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER, RoleCode.EMPLOYEE)
  @Get(":id/estimate-vs-actual")
  estimateVsActual(@Param("id") id: string) {
    return this.tasksService.estimateVsActual(id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.EMPLOYEE)
  @Post(":id/labels")
  addLabel(@Param("id") id: string, @Body() body: { labelId: string }) {
    return this.tasksService.addLabel(id, body.labelId);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.EMPLOYEE)
  @Delete(":id/labels/:labelId")
  removeLabel(@Param("id") id: string, @Param("labelId") labelId: string) {
    return this.tasksService.removeLabel(id, labelId);
  }
}
