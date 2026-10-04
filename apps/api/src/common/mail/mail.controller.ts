import { Body, Controller, Get, Post, Put, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { Roles } from "../decorators/roles.decorator";
import { JwtAuthGuard } from "../guards/jwt-auth.guard";
import { RolesGuard } from "../guards/roles.guard";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "./mail.service";

/**
 * Body for PUT /mail/settings. Password is treated as a write-only
 * secret — the empty string means "keep existing", same convention the
 * UI uses to avoid round-tripping the credential to the browser.
 */
class UpdateMailSettingsDto {
  @IsOptional() @IsString() host?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(65535) port?: number;
  @IsOptional() @IsString() user?: string;
  @IsOptional() @IsString() pass?: string; // "" = unchanged
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

class SendTestEmailDto {
  @IsEmail() to!: string;
  // Optional override fields — if a tester wants to verify creds before
  // saving them, they pass the candidate creds here. Empty falls back
  // to the stored OrganizationSettings.
  @IsOptional() @IsString() host?: string;
  @IsOptional() @Type(() => Number) @IsInt() port?: number;
  @IsOptional() @IsString() user?: string;
  @IsOptional() @IsString() pass?: string;
  @IsOptional() @IsString() from?: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("mail")
export class MailController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /**
   * Returns the current SMTP config so the Settings → Email page can
   * pre-fill the form. `pass` is replaced with a `••••` sentinel so the
   * real secret never leaves the server.
   */
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  @Get("settings")
  async getSettings() {
    const s = await this.prisma.organizationSettings.findFirst();
    const status = await this.mail.getStatus();
    return {
      host: s?.smtpHost ?? "",
      port: s?.smtpPort ?? 587,
      user: s?.smtpUser ?? "",
      // Mask: only signal whether a password is on file. Frontend treats
      // an empty `pass` submission as "leave unchanged".
      passSet: !!s?.smtpPass,
      from: s?.smtpFrom ?? "",
      enabled: s?.smtpEnabled ?? false,
      status: status.summary,
      transportReady: status.enabled,
    };
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  @Put("settings")
  async updateSettings(@Body() dto: UpdateMailSettingsDto) {
    let existing = await this.prisma.organizationSettings.findFirst();
    if (!existing) {
      existing = await this.prisma.organizationSettings.create({ data: {} });
    }
    // Build a partial update — only fields the client actually sent get
    // touched, and an empty password means "keep what we have".
    const data: Record<string, unknown> = {};
    if (dto.host !== undefined) data.smtpHost = dto.host || null;
    if (dto.port !== undefined) data.smtpPort = dto.port;
    if (dto.user !== undefined) data.smtpUser = dto.user || null;
    if (dto.pass !== undefined && dto.pass !== "") data.smtpPass = dto.pass;
    if (dto.from !== undefined) data.smtpFrom = dto.from || null;
    if (dto.enabled !== undefined) data.smtpEnabled = dto.enabled;

    const updated = await this.prisma.organizationSettings.update({
      where: { id: existing.id },
      data,
    });
    // Drop the cached transport so the next send picks up new creds.
    this.mail.invalidateTransport();
    const status = await this.mail.getStatus();
    return {
      ok: true,
      passSet: !!updated.smtpPass,
      enabled: updated.smtpEnabled,
      status: status.summary,
      transportReady: status.enabled,
    };
  }

  /**
   * Fire a one-off test email. If the body includes candidate
   * credentials we use those (so the user can verify before saving);
   * otherwise we use the stored OrganizationSettings row.
   */
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  @Post("test")
  async sendTest(@Body() dto: SendTestEmailDto) {
    let host = dto.host?.trim() || "";
    let port = dto.port ?? 587;
    let user = dto.user?.trim() || "";
    let pass = dto.pass?.trim() || "";
    let from = dto.from?.trim() || "";

    // Fill any missing fields from stored settings.
    if (!host || !user || !pass) {
      const s = await this.prisma.organizationSettings.findFirst();
      host = host || s?.smtpHost || "";
      port = dto.port ?? s?.smtpPort ?? 587;
      user = user || s?.smtpUser || "";
      pass = pass || s?.smtpPass || "";
      from = from || s?.smtpFrom || "";
    }
    if (!host || !user || !pass) {
      return { ok: false, error: "SMTP host/user/password not set." };
    }
    return this.mail.sendTestEmail({
      host, port, user, pass, from: from || user, to: dto.to,
    });
  }
}
