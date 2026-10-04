import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { RoleCode } from "@prisma/client";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CredentialsService } from "./credentials.service";
import {
  CreateCredentialDto,
  CreateFolderDto,
  ListCredentialsQueryDto,
  RevealCredentialDto,
  ShareCredentialDto,
  UpdateCredentialDto,
  UpdateFolderDto,
  UpdateShareRoleDto,
} from "./dto/credential.dto";

// Same trust-proxy fallback used elsewhere — give auditor IPs a fighting
// chance behind reverse proxies.
function pickClientIp(req: Request): string | undefined {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.trim()) return fwd.split(",")[0]!.trim();
  if (Array.isArray(fwd) && fwd[0]) return fwd[0].split(",")[0]!.trim();
  return req.ip ?? undefined;
}

function pickUserAgent(req: Request): string | undefined {
  const ua = req.headers["user-agent"];
  return typeof ua === "string" ? ua.slice(0, 500) : undefined;
}

const VAULT_ROLES = [
  RoleCode.SUPER_ADMIN,
  RoleCode.ADMIN,
  RoleCode.HR_MANAGER,
  RoleCode.PROJECT_MANAGER,
  RoleCode.FINANCE_MANAGER,
  RoleCode.EMPLOYEE,
];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("credentials")
@Roles(...VAULT_ROLES)
export class CredentialsController {
  constructor(private readonly svc: CredentialsService) {}

  // ── Folders ────────────────────────────────────────────────────────────────

  @Get("folders")
  listFolders(@CurrentUser() user: { id: string }) {
    return this.svc.listFolders(user.id);
  }

  @Post("folders")
  createFolder(@CurrentUser() user: { id: string }, @Body() dto: CreateFolderDto) {
    return this.svc.createFolder(user.id, dto);
  }

  @Patch("folders/:id")
  updateFolder(@Param("id") id: string, @Body() dto: UpdateFolderDto) {
    return this.svc.updateFolder(id, dto);
  }

  @Delete("folders/:id")
  deleteFolder(@Param("id") id: string) {
    return this.svc.deleteFolder(id);
  }

  // ── Share-dialog directory ────────────────────────────────────────────────

  @Get("users")
  listShareableUsers(
    @CurrentUser() user: { id: string },
    @Query("search") search?: string,
  ) {
    return this.svc.listShareableUsers(user.id, search);
  }

  // ── Credentials ────────────────────────────────────────────────────────────

  @Get()
  list(
    @CurrentUser() user: { id: string },
    @Query() query: ListCredentialsQueryDto,
  ) {
    return this.svc.list(user.id, query);
  }

  @Post()
  create(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateCredentialDto,
    @Req() req: Request,
  ) {
    return this.svc.create(user.id, dto, {
      ipAddress: pickClientIp(req),
      userAgent: pickUserAgent(req),
    });
  }

  @Get(":id")
  get(@CurrentUser() user: { id: string }, @Param("id") id: string) {
    return this.svc.getMetadata(user.id, id);
  }

  @Get(":id/audit")
  listAudit(@CurrentUser() user: { id: string }, @Param("id") id: string) {
    return this.svc.listAudit(user.id, id);
  }

  /**
   * Decrypt and return the secret payload. Audited every time. Front-end
   * MUST never cache the response and SHOULD clear the reveal after a
   * short window (we recommend 30s in the UI). When the credential has
   * `requiresReason=true`, the body must include a non-empty `reason`
   * which gets recorded on the audit row.
   */
  @Post(":id/reveal")
  reveal(
    @CurrentUser() user: { id: string },
    @Param("id") id: string,
    @Body() dto: RevealCredentialDto,
    @Req() req: Request,
  ) {
    return this.svc.reveal(user.id, id, dto.reason, {
      ipAddress: pickClientIp(req),
      userAgent: pickUserAgent(req),
    });
  }

  @Patch(":id")
  update(
    @CurrentUser() user: { id: string },
    @Param("id") id: string,
    @Body() dto: UpdateCredentialDto,
    @Req() req: Request,
  ) {
    return this.svc.update(user.id, id, dto, {
      ipAddress: pickClientIp(req),
      userAgent: pickUserAgent(req),
    });
  }

  @Delete(":id")
  remove(
    @CurrentUser() user: { id: string },
    @Param("id") id: string,
    @Req() req: Request,
  ) {
    return this.svc.remove(user.id, id, {
      ipAddress: pickClientIp(req),
      userAgent: pickUserAgent(req),
    });
  }

  // ── Shares ────────────────────────────────────────────────────────────────

  @Post(":id/shares")
  share(
    @CurrentUser() user: { id: string },
    @Param("id") id: string,
    @Body() dto: ShareCredentialDto,
    @Req() req: Request,
  ) {
    return this.svc.share(user.id, id, dto, {
      ipAddress: pickClientIp(req),
      userAgent: pickUserAgent(req),
    });
  }

  @Patch(":id/shares/:accessId")
  updateShareRole(
    @CurrentUser() user: { id: string },
    @Param("id") id: string,
    @Param("accessId") accessId: string,
    @Body() dto: UpdateShareRoleDto,
    @Req() req: Request,
  ) {
    return this.svc.updateShareRole(user.id, id, accessId, dto, {
      ipAddress: pickClientIp(req),
      userAgent: pickUserAgent(req),
    });
  }

  @Delete(":id/shares/:accessId")
  unshare(
    @CurrentUser() user: { id: string },
    @Param("id") id: string,
    @Param("accessId") accessId: string,
    @Req() req: Request,
  ) {
    return this.svc.unshare(user.id, id, accessId, {
      ipAddress: pickClientIp(req),
      userAgent: pickUserAgent(req),
    });
  }
}
