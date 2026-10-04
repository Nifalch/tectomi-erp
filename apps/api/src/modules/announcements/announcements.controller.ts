import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import {
  CreateAnnouncementDto,
  UpdateAnnouncementDto,
} from "./dto/announcement.dto";
import { AnnouncementsService } from "./announcements.service";

const ALL_ROLES = [
  RoleCode.SUPER_ADMIN,
  RoleCode.ADMIN,
  RoleCode.HR_MANAGER,
  RoleCode.PROJECT_MANAGER,
  RoleCode.FINANCE_MANAGER,
  RoleCode.EMPLOYEE,
];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("announcements")
export class AnnouncementsController {
  constructor(private readonly svc: AnnouncementsService) {}

  @Roles(...ALL_ROLES)
  @Get()
  list() {
    return this.svc.list();
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Post()
  create(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateAnnouncementDto,
  ) {
    return this.svc.create(user.id, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateAnnouncementDto) {
    return this.svc.update(id, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.svc.remove(id);
  }
}
