import { Body, Controller, Delete, Get, Param, Put, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { isAdminRole } from "../../common/scope/resolve-scope.util";
import { UpsertRetrospectiveDto } from "./dto/retrospective.dto";
import { SprintRetrospectiveService } from "./retrospective.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("sprints/:sprintId/retrospective")
export class SprintRetrospectiveController {
  constructor(private readonly service: SprintRetrospectiveService) {}

  // Read access: any role that might view sprints + must have access to the project.
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
  async get(
    @Param("sprintId") sprintId: string,
    @CurrentUser() user: { id: string; roles?: RoleCode[] },
  ) {
    await this.service.assertCanRead(sprintId, user, isAdminRole(user));
    return this.service.get(sprintId);
  }

  // Write access: PROJECT_MANAGER and above only.
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Put()
  upsert(
    @Param("sprintId") sprintId: string,
    @Body() dto: UpsertRetrospectiveDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.upsert(sprintId, dto, user.id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Delete()
  remove(@Param("sprintId") sprintId: string) {
    return this.service.remove(sprintId);
  }
}
