import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { SprintsService } from "./sprints.service";

interface CreateSprintBody {
  projectId: string;
  name: string;
  goal?: string;
  startDate: string;
  endDate: string;
  status?: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("sprints")
export class SprintsController {
  constructor(private readonly sprintsService: SprintsService) {}

  @Roles(
    RoleCode.SUPER_ADMIN,
    RoleCode.ADMIN,
    RoleCode.PROJECT_MANAGER,
    RoleCode.EMPLOYEE,
    RoleCode.CLIENT,
    RoleCode.FINANCE_MANAGER,
    RoleCode.HR_MANAGER,
  )
  @Get()
  findAll(@Query("projectId") projectId: string) {
    return this.sprintsService.findAll(projectId);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Post()
  create(@Body() dto: CreateSprintBody) {
    return this.sprintsService.create(dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: Partial<CreateSprintBody>) {
    return this.sprintsService.update(id, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.sprintsService.remove(id);
  }

  @Roles(
    RoleCode.SUPER_ADMIN,
    RoleCode.ADMIN,
    RoleCode.PROJECT_MANAGER,
    RoleCode.EMPLOYEE,
    RoleCode.CLIENT,
    RoleCode.FINANCE_MANAGER,
    RoleCode.HR_MANAGER,
  )
  @Get(":id/burndown")
  getBurndown(@Param("id") id: string) {
    return this.sprintsService.getBurndown(id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Post(":id/snapshot")
  captureSnapshot(@Param("id") id: string) {
    return this.sprintsService.captureSnapshot(id);
  }

  @Roles(
    RoleCode.SUPER_ADMIN,
    RoleCode.ADMIN,
    RoleCode.PROJECT_MANAGER,
    RoleCode.EMPLOYEE,
    RoleCode.CLIENT,
    RoleCode.FINANCE_MANAGER,
    RoleCode.HR_MANAGER,
  )
  @Get("velocity/:projectId")
  getProjectVelocity(@Param("projectId") projectId: string) {
    return this.sprintsService.getProjectVelocity(projectId);
  }
}
