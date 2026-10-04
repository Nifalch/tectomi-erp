import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { TemplatesService } from "./templates.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("templates")
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

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
    return this.templatesService.findAll();
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
    return this.templatesService.create(user.id, dto);
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
    return this.templatesService.update(id, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.templatesService.remove(id);
  }
}
