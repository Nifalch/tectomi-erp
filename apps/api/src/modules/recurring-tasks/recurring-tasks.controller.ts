import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { PaginationDto } from "../../common/pagination/pagination.dto";
import {
  CreateRecurringTaskDto,
  UpdateRecurringTaskDto,
} from "./dto/recurring-task.dto";
import { RecurringTasksService } from "./recurring-tasks.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("recurring-tasks")
export class RecurringTasksController {
  constructor(private readonly service: RecurringTasksService) {}

  @Roles(
    RoleCode.SUPER_ADMIN,
    RoleCode.ADMIN,
    RoleCode.PROJECT_MANAGER,
    RoleCode.HR_MANAGER,
    RoleCode.EMPLOYEE,
  )
  @Get()
  findAll(@Query() query: PaginationDto & { projectId?: string }) {
    return this.service.findAll(query, query.projectId);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Post("run-due")
  runDue() {
    return this.service.runDue();
  }

  @Roles(
    RoleCode.SUPER_ADMIN,
    RoleCode.ADMIN,
    RoleCode.PROJECT_MANAGER,
    RoleCode.HR_MANAGER,
    RoleCode.EMPLOYEE,
  )
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.service.findOne(id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Post()
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateRecurringTaskDto) {
    return this.service.create(user.id, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateRecurringTaskDto) {
    return this.service.update(id, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.service.remove(id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Post(":id/pause")
  pause(@Param("id") id: string) {
    return this.service.pause(id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Post(":id/resume")
  resume(@Param("id") id: string) {
    return this.service.resume(id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Post(":id/end")
  end(@Param("id") id: string) {
    return this.service.end(id);
  }
}
