import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import {
  CreateEquityGrantDto,
  CreateLedgerEntryDto,
  CreateValuationDto,
  UpdateEquityGrantDto,
  UpdateValuationDto,
} from "./dto/founder.dto";
import { FoundersService } from "./founders.service";

const FOUNDER_READ_ROLES = [
  RoleCode.SUPER_ADMIN,
  RoleCode.ADMIN,
  RoleCode.HR_MANAGER,
  RoleCode.EMPLOYEE, // founder viewing themselves
];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("founders")
export class FoundersController {
  constructor(private readonly service: FoundersService) {}

  // ── Combined dashboard (HR-only) ──
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Get("dashboard")
  dashboard(@CurrentUser() user: { id: string; roles: RoleCode[] }) {
    return this.service.dashboard(user);
  }

  // ── Capital account (per founder) ──
  @Roles(...FOUNDER_READ_ROLES)
  @Get(":userId/capital")
  capital(
    @Param("userId") userId: string,
    @CurrentUser() user: { id: string; roles: RoleCode[] },
  ) {
    return this.service.getCapitalAccount(user, userId);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Post(":userId/capital/entries")
  addLedgerEntry(
    @Param("userId") userId: string,
    @Body() dto: CreateLedgerEntryDto,
    @CurrentUser() user: { id: string; roles: RoleCode[] },
  ) {
    return this.service.createLedgerEntry(user, userId, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Delete(":userId/capital/entries/:entryId")
  deleteLedgerEntry(
    @Param("userId") userId: string,
    @Param("entryId") entryId: string,
    @CurrentUser() user: { id: string; roles: RoleCode[] },
  ) {
    return this.service.deleteLedgerEntry(user, userId, entryId);
  }

  // ── Cap-table view (HR-only aggregated, or per-employee scoped) ──
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Get("cap-table")
  capTable(@CurrentUser() user: { id: string; roles: RoleCode[] }) {
    return this.service.capTable(user);
  }

  @Roles(...FOUNDER_READ_ROLES)
  @Get("grants")
  listGrants(
    @Query("userId") userId: string | undefined,
    @CurrentUser() user: { id: string; roles: RoleCode[] },
  ) {
    return this.service.listGrants(user, userId);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Post("grants")
  createGrant(
    @Body() dto: CreateEquityGrantDto,
    @CurrentUser() user: { id: string; roles: RoleCode[] },
  ) {
    return this.service.createGrant(user, dto);
  }

  // Editing or deleting a grant rewrites ownership % retroactively, so
  // these are SUPER_ADMIN-only (matching the valuation guard).
  @Roles(RoleCode.SUPER_ADMIN)
  @Patch("grants/:id")
  updateGrant(
    @Param("id") id: string,
    @Body() dto: UpdateEquityGrantDto,
    @CurrentUser() user: { id: string; roles: RoleCode[] },
  ) {
    return this.service.updateGrant(user, id, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN)
  @Delete("grants/:id")
  deleteGrant(
    @Param("id") id: string,
    @CurrentUser() user: { id: string; roles: RoleCode[] },
  ) {
    return this.service.deleteGrant(user, id);
  }

  // ── Company valuation snapshots ──
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Get("valuations")
  listValuations(@CurrentUser() user: { id: string; roles: RoleCode[] }) {
    return this.service.listValuations(user);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Post("valuations")
  createValuation(
    @Body() dto: CreateValuationDto,
    @CurrentUser() user: { id: string; roles: RoleCode[] },
  ) {
    return this.service.createValuation(user, dto);
  }

  // Editing or deleting a recorded valuation rewrites cap-table history,
  // so we tighten the gate to SUPER_ADMIN. (The service layer also
  // re-validates — defense in depth.)
  @Roles(RoleCode.SUPER_ADMIN)
  @Patch("valuations/:id")
  updateValuation(
    @Param("id") id: string,
    @Body() dto: UpdateValuationDto,
    @CurrentUser() user: { id: string; roles: RoleCode[] },
  ) {
    return this.service.updateValuation(user, id, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN)
  @Delete("valuations/:id")
  deleteValuation(
    @Param("id") id: string,
    @CurrentUser() user: { id: string; roles: RoleCode[] },
  ) {
    return this.service.deleteValuation(user, id);
  }
}
