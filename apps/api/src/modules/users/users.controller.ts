import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { FindUsersDto } from "./dto/find-users.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { isAdminRole } from "../../common/scope/resolve-scope.util";
import { CreateUserDto } from "./dto/create-user.dto";
import { ResetUserPasswordDto, SetUserRolesDto, UpdateUserDto } from "./dto/update-user.dto";
import { UsersService } from "./users.service";
import { AuthService } from "../auth/auth.service";
import { ProjectsService } from "../projects/projects.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("users")
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
    private readonly projectsService: ProjectsService,
  ) {}

  // Capacity aggregate across all active projects. Admin or the user themself.
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER, RoleCode.PROJECT_MANAGER, RoleCode.EMPLOYEE)
  @Get(":id/capacity")
  capacity(
    @Param("id") id: string,
    @CurrentUser() user: { id: string; roles?: RoleCode[] },
  ) {
    if (user.id !== id && !isAdminRole(user)) {
      throw new ForbiddenException("You can only view your own capacity.");
    }
    return this.projectsService.userCapacity(id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER, RoleCode.PROJECT_MANAGER)
  @Get()
  findAll(@Query() query: FindUsersDto) {
    // Both flags are admin-opt-in. Defaults to false on both so
    // assignment pickers (project members, task assignees, founder
    // picker, chat invites, etc.) naturally hide deactivated accounts
    // AND client-portal users.
    return this.usersService.findAll(query, {
      includeInactive: query.includeInactive === "true",
      includeClients: query.includeClients === "true",
    });
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER, RoleCode.PROJECT_MANAGER)
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.usersService.findOne(id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN)
  @Post(":id/roles")
  setRoles(
    @Param("id") id: string,
    @Body() dto: SetUserRolesDto,
    @CurrentUser() actor: { id: string },
  ) {
    return this.usersService.setRoles(id, dto, actor.id);
  }

  @Roles(RoleCode.SUPER_ADMIN)
  @Post(":id/reset-password")
  resetPassword(@Param("id") id: string, @Body() dto: ResetUserPasswordDto) {
    return this.usersService.resetPassword(id, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN)
  @Post(":id/impersonate")
  impersonate(@Param("id") id: string, @CurrentUser() actor: { id: string }) {
    return this.authService.impersonate(id, actor.id);
  }

  @Roles(RoleCode.SUPER_ADMIN)
  @Delete(":id")
  remove(@Param("id") id: string, @CurrentUser() actor: { id: string }) {
    return this.usersService.remove(id, actor.id);
  }
}
