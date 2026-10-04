import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { LabelsService } from "./labels.service";

interface CreateLabelBody {
  name: string;
  color?: string;
  projectId?: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("labels")
export class LabelsController {
  constructor(private readonly labelsService: LabelsService) {}

  @Roles(
    RoleCode.SUPER_ADMIN,
    RoleCode.ADMIN,
    RoleCode.PROJECT_MANAGER,
    RoleCode.EMPLOYEE,
    RoleCode.CLIENT,
    RoleCode.FINANCE_MANAGER,
    RoleCode.HR_MANAGER,
    RoleCode.FINANCE_MANAGER,
  )
  @Get()
  findAll(@Query("projectId") projectId?: string) {
    return this.labelsService.findAll(projectId);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.EMPLOYEE)
  @Post()
  create(@Body() dto: CreateLabelBody) {
    return this.labelsService.create(dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.EMPLOYEE)
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: Partial<CreateLabelBody>) {
    return this.labelsService.update(id, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.labelsService.remove(id);
  }
}
