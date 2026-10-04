import { Controller, Get, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { ActivityLogService } from "./activity.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("activity")
export class ActivityController {
  constructor(private readonly activityLogService: ActivityLogService) {}

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  @Get()
  findAll() {
    return this.activityLogService.findAll();
  }
}
