import { Body, Controller, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import { PermissionAction, RoleCode } from "@prisma/client";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { RolesService } from "./roles.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("roles")
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  @Get()
  list() {
    return this.rolesService.list();
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  @Get("permissions/matrix")
  matrix() {
    return this.rolesService.getMatrix();
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  @Get("permissions/all")
  listPermissions() {
    return this.rolesService.listPermissions();
  }

  @Roles(RoleCode.SUPER_ADMIN)
  @Post("permissions/seed-defaults")
  seedPermissions() {
    return this.rolesService.seedDefaultPermissions();
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  @Get(":code/permissions")
  getRolePermissions(@Param("code") code: RoleCode) {
    return this.rolesService.getRolePermissions(code);
  }

  @Roles(RoleCode.SUPER_ADMIN)
  @Put(":code/permissions")
  setRolePermissions(
    @Param("code") code: RoleCode,
    @Body() body: { permissions: Array<{ resource: string; action: PermissionAction; granted: boolean }> },
  ) {
    return this.rolesService.setRolePermissions(code, body);
  }
}
