import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CalendarService } from "./calendar.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("calendar")
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

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
    return this.calendarService.findAll();
  }

  @Roles(
    RoleCode.SUPER_ADMIN,
    RoleCode.ADMIN,
    RoleCode.PROJECT_MANAGER,
    RoleCode.HR_MANAGER,
    RoleCode.FINANCE_MANAGER,
    RoleCode.EMPLOYEE,
    RoleCode.CLIENT,
  )
  @Post()
  create(@CurrentUser() user: { id: string }, @Body() dto: any) {
    return this.calendarService.create(user.id, dto);
  }

  @Roles(
    RoleCode.SUPER_ADMIN,
    RoleCode.ADMIN,
    RoleCode.PROJECT_MANAGER,
    RoleCode.HR_MANAGER,
    RoleCode.FINANCE_MANAGER,
    RoleCode.EMPLOYEE,
    RoleCode.CLIENT,
  )
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: any) {
    return this.calendarService.update(id, dto);
  }

  @Roles(
    RoleCode.SUPER_ADMIN,
    RoleCode.ADMIN,
    RoleCode.PROJECT_MANAGER,
    RoleCode.HR_MANAGER,
    RoleCode.FINANCE_MANAGER,
    RoleCode.EMPLOYEE,
    RoleCode.CLIENT,
  )
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.calendarService.remove(id);
  }
}
