import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { GoalsService } from "./goals.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("goals")
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  @Roles(
    RoleCode.SUPER_ADMIN,
    RoleCode.ADMIN,
    RoleCode.PROJECT_MANAGER,
    RoleCode.HR_MANAGER,
    RoleCode.FINANCE_MANAGER,
    RoleCode.EMPLOYEE,
    RoleCode.CLIENT,
  )
  @Get()
  findAll() {
    return this.goalsService.findAll();
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER, RoleCode.EMPLOYEE)
  @Post()
  create(@Body() dto: any, @CurrentUser() user: { id: string }) {
    // assigneeId is required by the Goal schema; default it to the creator so
    // the dialog can stay simple (no assignee picker on the frontend yet).
    return this.goalsService.create({ ...dto, assigneeId: dto.assigneeId ?? user.id });
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER, RoleCode.EMPLOYEE)
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: any, @CurrentUser() user: { id: string; roles: string[] }) {
    return this.goalsService.update(id, dto, user);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER, RoleCode.EMPLOYEE)
  @Delete(":id")
  remove(@Param("id") id: string, @CurrentUser() user: { id: string; roles: string[] }) {
    return this.goalsService.remove(id, user);
  }
}
