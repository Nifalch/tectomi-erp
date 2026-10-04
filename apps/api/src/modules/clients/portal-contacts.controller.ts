import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { IsEmail, IsEnum, IsOptional, IsString } from "class-validator";
import { PortalContactsService } from "./portal-contacts.service";

class InviteDto {
  @IsEmail() email!: string;
  @IsOptional() @IsString() name?: string;
}

class StatusDto {
  @IsEnum(["ACTIVE", "DISABLED"])
  status!: "ACTIVE" | "DISABLED";
}

@Controller("clients/:clientId/portal-contacts")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
export class PortalContactsController {
  constructor(private readonly svc: PortalContactsService) {}

  @Get()
  list(@Param("clientId") clientId: string) {
    return this.svc.list(clientId);
  }

  @Post()
  invite(@Param("clientId") clientId: string, @Body() dto: InviteDto) {
    return this.svc.invite(clientId, dto.email, dto.name ?? null);
  }

  @Patch(":id/status")
  setStatus(
    @Param("clientId") clientId: string,
    @Param("id") id: string,
    @Body() dto: StatusDto,
  ) {
    return this.svc.setStatus(clientId, id, dto.status);
  }

  @Delete(":id/sessions")
  revoke(@Param("clientId") clientId: string, @Param("id") id: string) {
    return this.svc.revokeAllSessions(clientId, id);
  }

  /**
   * Mint a fresh magic link for an existing portal contact. Returns the
   * URL so staff can copy/share it via WhatsApp etc. — handy when SMTP
   * delivery isn't set up or the client missed the original email.
   */
  @Post(":id/resend")
  resend(@Param("clientId") clientId: string, @Param("id") id: string) {
    return this.svc.resendLink(clientId, id);
  }
}
