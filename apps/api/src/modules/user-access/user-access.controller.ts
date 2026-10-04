import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { UserAccessService } from "./user-access.service";
import { SetUserAccessDto } from "./dto/user-access.dto";

const ADMIN_ROLES = [RoleCode.SUPER_ADMIN, RoleCode.ADMIN];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("user-access")
export class UserAccessController {
  constructor(private readonly svc: UserAccessService) {}

  /** Bootstrap call — returns the caller's role codes + override rows so the
   *  sidebar can union them with the contracts navigationItems baseline.
   *  Open to every authenticated role so the sidebar can call it on load. */
  @Get("me")
  mySnapshot(@CurrentUser() user: { id: string }) {
    return this.svc.myAccessSnapshot(user.id);
  }

  // ── Admin-only management ──────────────────────────────────────────────────

  @Roles(...ADMIN_ROLES)
  @Get(":userId")
  forAdmin(@Param("userId") userId: string) {
    return this.svc.listForAdmin(userId);
  }

  @Roles(...ADMIN_ROLES)
  @Get(":userId/overrides")
  overrides(@Param("userId") userId: string) {
    return this.svc.listOverrides(userId);
  }

  @Roles(...ADMIN_ROLES)
  @Post(":userId")
  setOverride(
    @CurrentUser() actor: { id: string },
    @Param("userId") userId: string,
    @Body() dto: SetUserAccessDto,
  ) {
    return this.svc.setOverride(actor.id, userId, dto);
  }

  @Roles(...ADMIN_ROLES)
  @Delete(":userId/:moduleKey")
  clearOverride(@Param("userId") userId: string, @Param("moduleKey") moduleKey: string) {
    return this.svc.clearOverride(userId, moduleKey);
  }
}
