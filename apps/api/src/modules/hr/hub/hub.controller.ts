import { Controller, Get, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { Roles } from "../../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../../common/guards/roles.guard";
import { HubService } from "./hub.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("hr")
export class HubController {
  constructor(private readonly service: HubService) {}

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER, RoleCode.FINANCE_MANAGER)
  @Get("hub")
  hub() {
    return this.service.getHub();
  }

  @Roles(
    RoleCode.SUPER_ADMIN,
    RoleCode.ADMIN,
    RoleCode.HR_MANAGER,
    RoleCode.FINANCE_MANAGER,
    RoleCode.PROJECT_MANAGER,
    RoleCode.EMPLOYEE,
  )
  @Get("org-chart")
  orgChart() {
    return this.service.getOrgChart();
  }
}
