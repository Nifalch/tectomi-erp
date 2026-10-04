import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { UpdateOrgSettingsDto } from "./dto/org-settings.dto";
import { OrgSettingsService } from "./org-settings.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("org-settings")
export class OrgSettingsController {
  constructor(private readonly service: OrgSettingsService) {}

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER)
  @Get()
  get() {
    return this.service.get();
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER)
  @Patch()
  update(@Body() dto: UpdateOrgSettingsDto) {
    return this.service.update(dto);
  }
}
