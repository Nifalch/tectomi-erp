import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CreateEmployeeDto } from "./dto/create-employee.dto";
import { UpdateEmployeeProfileDto } from "./dto/update-employee-profile.dto";
import { HrService } from "./hr.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("hr")
export class HrController {
  constructor(private readonly hrService: HrService) {}

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER, RoleCode.FINANCE_MANAGER)
  @Get("overview")
  overview() {
    return this.hrService.overview();
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Post("employees")
  createEmployee(
    @Body() dto: CreateEmployeeDto,
    @CurrentUser() actor: { id: string },
  ) {
    return this.hrService.createEmployee(dto, actor.id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER, RoleCode.FINANCE_MANAGER)
  @Patch("employees/:userId")
  updateProfile(
    @Param("userId") userId: string,
    @Body() dto: UpdateEmployeeProfileDto,
    @CurrentUser() actor: { id: string; roles?: RoleCode[] },
  ) {
    return this.hrService.updateProfile(userId, dto, actor);
  }
}
