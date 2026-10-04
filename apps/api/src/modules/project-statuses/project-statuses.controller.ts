import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import {
  CreateProjectStatusDto,
  UpdateProjectStatusDto,
} from "./dto/project-status.dto";
import { ProjectStatusesService } from "./project-statuses.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("project-statuses")
export class ProjectStatusesController {
  constructor(private readonly service: ProjectStatusesService) {}

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.EMPLOYEE, RoleCode.HR_MANAGER)
  @Get()
  findAll(@Query("projectId") projectId: string) {
    if (!projectId) throw new BadRequestException("projectId query parameter is required.");
    return this.service.findAll(projectId);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Post()
  create(@Body() dto: CreateProjectStatusDto) {
    return this.service.create(dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateProjectStatusDto) {
    return this.service.update(id, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.service.remove(id);
  }
}
