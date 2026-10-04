import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  EquityGrantStatus,
  EquityGrantType,
  FounderLedgerDirection,
  FounderLedgerKind,
  Prisma,
  RoleCode,
} from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AutoPostService } from "../finance/auto-post.service";
import {
  CreateEquityGrantDto,
  CreateLedgerEntryDto,
  CreateValuationDto,
  UpdateEquityGrantDto,
  UpdateValuationDto,
} from "./dto/founder.dto";

type CurrentUser = { id: string; roles?: RoleCode[] };

function num(v: Prisma.Decimal | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : Number(v);
}

function isHr(user: CurrentUser): boolean {
  return !!(
    user.roles?.includes(RoleCode.SUPER_ADMIN) ||
    user.roles?.includes(RoleCode.ADMIN) ||
    user.roles?.includes(RoleCode.HR_MANAGER)
  );
}

/**
 * Compute vested-share count for a grant as of a date. Math:
 *   - Before grantDate or grantDate + cliffMonths → 0 shares vested.
 *   - At cliff → cliff portion (shares * cliffMonths / vestingMonths).
 *   - After cliff → linear monthly accrual up to total shares.
 *   - vestingMonths === 0 → fully vested on grantDate.
 *   - CANCELLED grants vest 0 regardless of date.
 */
function vestedShares(grant: {
  shares: number;
  grantDate: Date;
  vestingMonths: number;
  cliffMonths: number;
  status: EquityGrantStatus;
}, asOf: Date): number {
  if (grant.status === EquityGrantStatus.CANCELLED) return 0;
  if (grant.vestingMonths === 0) {
    // Fully vested on grantDate (typical for founder shares).
    return asOf >= grant.grantDate ? grant.shares : 0;
  }
  const monthsSinceGrant =
    (asOf.getFullYear() - grant.grantDate.getFullYear()) * 12 +
    (asOf.getMonth() - grant.grantDate.getMonth()) +
    (asOf.getDate() >= grant.grantDate.getDate() ? 0 : -1);
  if (monthsSinceGrant < grant.cliffMonths) return 0;
  if (monthsSinceGrant >= grant.vestingMonths) return grant.shares;
  return Math.floor((grant.shares * monthsSinceGrant) / grant.vestingMonths);
}

@Injectable()
export class FoundersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autoPost: AutoPostService,
  ) {}

  // ── Authorization helpers ──
  private async resolveFounder(userId: string) {
    const profile = await this.prisma.employeeProfile.findUnique({
      where: { userId },
      select: { id: true, userId: true, isFounder: true },
    });
    if (!profile) throw new NotFoundException("Employee profile not found");
    if (!profile.isFounder) {
      throw new BadRequestException("This endpoint is only for co-founders.");
    }
    return profile;
  }

  private assertCanRead(viewer: CurrentUser, ownerUserId: string) {
    if (viewer.id === ownerUserId) return;
    if (isHr(viewer)) return;
    throw new ForbiddenException("You can only view your own founder records.");
  }

  private assertHrOnly(viewer: CurrentUser) {
    if (!isHr(viewer)) {
      throw new ForbiddenException("Only HR / admin can perform this action.");
    }
  }

  // Stricter gate for actions that mutate signed/historical data (e.g.
  // editing or deleting a recorded company valuation — those affect the
  // cap-table denominator retroactively, so we limit it to the highest
  // role).
  private assertSuperAdmin(viewer: CurrentUser) {
    if (!viewer.roles?.includes(RoleCode.SUPER_ADMIN)) {
      throw new ForbiddenException("Only SUPER_ADMIN can perform this action.");
    }
  }

  // ── Capital account ──
  /**
   * Roll up a founder's capital account balance from two sources:
   *   1. Deferred salary on PaySlips (PaySlip.deferredAmount — CREDIT only).
   *   2. Manual ledger entries (FounderLedgerEntry — CREDIT or DEBIT).
   *
   * Returns the running balance (positive = company owes founder, negative
   * = founder owes company) plus a sectioned breakdown so the UI can show
   * what made up the balance without recomputing.
   */
  async getCapitalAccount(viewer: CurrentUser, userId: string) {
    const founder = await this.resolveFounder(userId);
    this.assertCanRead(viewer, founder.userId);

    const [entries, slips] = await Promise.all([
      this.prisma.founderLedgerEntry.findMany({
        where: { employeeId: founder.id },
        orderBy: { date: "desc" },
        include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
      }),
      this.prisma.paySlip.findMany({
        where: { employeeId: founder.id, deferredAmount: { gt: 0 } },
        orderBy: [{ year: "desc" }, { month: "desc" }],
        select: {
          id: true,
          month: true,
          year: true,
          netSalary: true,
          drawnAmount: true,
          deferredAmount: true,
        },
      }),
    ]);

    const credits = entries
      .filter((e) => e.direction === FounderLedgerDirection.CREDIT)
      .reduce((acc, e) => acc + num(e.amount), 0);
    const debits = entries
      .filter((e) => e.direction === FounderLedgerDirection.DEBIT)
      .reduce((acc, e) => acc + num(e.amount), 0);
    const deferredFromSlips = slips.reduce((acc, s) => acc + num(s.deferredAmount), 0);
    const balance = credits + deferredFromSlips - debits;

    return {
      founder: { userId: founder.userId, employeeId: founder.id },
      balance,
      breakdown: {
        deferredFromSlips,
        ledgerCredits: credits,
        ledgerDebits: debits,
      },
      entries,
      slips,
    };
  }

  async createLedgerEntry(viewer: CurrentUser, userId: string, dto: CreateLedgerEntryDto) {
    this.assertHrOnly(viewer);
    const founder = await this.resolveFounder(userId);
    const entry = await this.prisma.founderLedgerEntry.create({
      data: {
        employeeId: founder.id,
        date: new Date(dto.date),
        direction: dto.direction,
        kind: dto.kind,
        amount: new Prisma.Decimal(dto.amount),
        description: dto.description,
        reference: dto.reference,
        createdById: viewer.id,
      },
    });
    // Auto-post to the GL: CREDIT entry = company received from founder
    // (debit cash, credit founder payable); DEBIT entry = company paid
    // the founder (debit founder payable, credit cash). Non-fatal — a
    // post failure logs and can be retried via /finance/backfill.
    try {
      await this.autoPost.postFounderLedger(entry.id, viewer.id);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[AutoPost] Failed to post founder ledger entry", entry.id, err);
    }
    return entry;
  }

  async deleteLedgerEntry(viewer: CurrentUser, userId: string, entryId: string) {
    this.assertHrOnly(viewer);
    const founder = await this.resolveFounder(userId);
    const entry = await this.prisma.founderLedgerEntry.findUnique({ where: { id: entryId } });
    if (!entry || entry.employeeId !== founder.id) {
      throw new NotFoundException("Ledger entry not found");
    }
    // Reverse the GL side so the ledger stays consistent. Find the JE
    // for this source, unwind any bank-mirror cash effect, delete the
    // mirror, then delete the JE itself. Order matters — bank balance
    // must be unwound BEFORE the mirror row is gone.
    const je = await this.prisma.journalEntry.findFirst({
      where: { source: "FOUNDER_LEDGER", sourceId: entryId },
      include: { bankTransactions: true },
    });
    if (je) {
      for (const mirror of je.bankTransactions) {
        const delta = mirror.type === "CREDIT" ? -Number(mirror.amount) : Number(mirror.amount);
        await this.prisma.bankAccount.update({
          where: { id: mirror.bankAccountId },
          data: { currentBalance: { increment: new Prisma.Decimal(delta) } },
        });
      }
      await this.prisma.bankTransaction.deleteMany({ where: { journalEntryId: je.id } });
      await this.prisma.journalEntry.delete({ where: { id: je.id } });
    }
    await this.prisma.founderLedgerEntry.delete({ where: { id: entryId } });
    return { success: true };
  }

  // ── Equity grants ──
  async listGrants(viewer: CurrentUser, userId?: string) {
    const where: Prisma.EquityGrantWhereInput = {};
    if (userId) {
      // Scoping by employee — must be founder + viewer must be HR or that employee.
      // External-holder grants are skipped from this scoped view by definition.
      const founder = await this.resolveFounder(userId);
      this.assertCanRead(viewer, founder.userId);
      where.employeeId = founder.id;
    } else {
      // Full cap-table view — HR only. Includes both employee and
      // external-holder grants.
      this.assertHrOnly(viewer);
    }
    return this.prisma.equityGrant.findMany({
      where,
      include: { employee: { include: { user: { select: { firstName: true, lastName: true, email: true } } } } },
      orderBy: [{ grantDate: "desc" }],
    });
  }

  async createGrant(viewer: CurrentUser, dto: CreateEquityGrantDto) {
    this.assertHrOnly(viewer);
    // A grant must target EITHER an existing employee profile (internal:
    // founder shares, ESOP, advisor-on-payroll) OR an external holder
    // (investors, outside advisors). Enforce exactly-one-of here so a
    // typo doesn't silently create an orphan grant.
    const hasInternal = !!dto.employeeId;
    const hasExternal = !!dto.holderName;
    if (!hasInternal && !hasExternal) {
      throw new BadRequestException(
        "Provide either employeeId (for internal grants) or holderName (for external investors/advisors).",
      );
    }
    if (hasInternal && hasExternal) {
      throw new BadRequestException(
        "A grant can't be both internal and external — pick one.",
      );
    }

    let employeeId: string | null = null;
    if (hasInternal) {
      const profile = await this.prisma.employeeProfile.findFirst({
        where: { OR: [{ id: dto.employeeId! }, { userId: dto.employeeId! }] },
        select: { id: true },
      });
      if (!profile) throw new NotFoundException("Employee profile not found");
      employeeId = profile.id;
    }

    return this.prisma.equityGrant.create({
      data: {
        employeeId,
        holderName: hasExternal ? dto.holderName! : null,
        holderEmail: hasExternal ? dto.holderEmail ?? null : null,
        organization: hasExternal ? dto.organization ?? null : null,
        investmentAmount: dto.investmentAmount != null ? new Prisma.Decimal(dto.investmentAmount) : null,
        investmentDate: dto.investmentDate ? new Date(dto.investmentDate) : null,
        type: dto.type ?? (hasExternal ? EquityGrantType.INVESTOR : EquityGrantType.FOUNDER_SHARES),
        shares: dto.shares,
        grantDate: new Date(dto.grantDate),
        vestingMonths: dto.vestingMonths ?? 0,
        cliffMonths: dto.cliffMonths ?? 0,
        notes: dto.notes,
        createdById: viewer.id,
      },
    });
  }

  async updateGrant(viewer: CurrentUser, id: string, dto: UpdateEquityGrantDto) {
    this.assertSuperAdmin(viewer);
    const existing = await this.prisma.equityGrant.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Grant not found");
    const data: Prisma.EquityGrantUpdateInput = {};
    if (dto.type) data.type = dto.type;
    if (dto.shares != null) data.shares = dto.shares;
    if (dto.grantDate) data.grantDate = new Date(dto.grantDate);
    if (dto.vestingMonths != null) data.vestingMonths = dto.vestingMonths;
    if (dto.cliffMonths != null) data.cliffMonths = dto.cliffMonths;
    if (dto.status) data.status = dto.status;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.holderName !== undefined) data.holderName = dto.holderName;
    if (dto.holderEmail !== undefined) data.holderEmail = dto.holderEmail;
    if (dto.organization !== undefined) data.organization = dto.organization;
    if (dto.investmentAmount !== undefined) {
      data.investmentAmount = dto.investmentAmount === null
        ? null
        : new Prisma.Decimal(dto.investmentAmount);
    }
    if (dto.investmentDate !== undefined) {
      data.investmentDate = dto.investmentDate ? new Date(dto.investmentDate) : null;
    }
    return this.prisma.equityGrant.update({ where: { id }, data });
  }

  async deleteGrant(viewer: CurrentUser, id: string) {
    this.assertSuperAdmin(viewer);
    const existing = await this.prisma.equityGrant.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Grant not found");
    await this.prisma.equityGrant.delete({ where: { id } });
    return { success: true };
  }

  // ── Valuation ──
  async listValuations(viewer: CurrentUser) {
    this.assertHrOnly(viewer);
    return this.prisma.companyValuation.findMany({
      orderBy: { asOf: "desc" },
      include: { createdBy: { select: { firstName: true, lastName: true } } },
    });
  }

  async createValuation(viewer: CurrentUser, dto: CreateValuationDto) {
    this.assertHrOnly(viewer);
    return this.prisma.companyValuation.create({
      data: {
        totalShares: dto.totalShares,
        sharePrice: new Prisma.Decimal(dto.sharePrice),
        asOf: new Date(dto.asOf),
        notes: dto.notes,
        createdById: viewer.id,
      },
    });
  }

  async updateValuation(viewer: CurrentUser, id: string, dto: UpdateValuationDto) {
    this.assertSuperAdmin(viewer);
    const existing = await this.prisma.companyValuation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Valuation snapshot not found");
    const data: Prisma.CompanyValuationUpdateInput = {};
    if (dto.totalShares != null) data.totalShares = dto.totalShares;
    if (dto.sharePrice != null) data.sharePrice = new Prisma.Decimal(dto.sharePrice);
    if (dto.asOf) data.asOf = new Date(dto.asOf);
    if (dto.notes !== undefined) data.notes = dto.notes;
    return this.prisma.companyValuation.update({ where: { id }, data });
  }

  async deleteValuation(viewer: CurrentUser, id: string) {
    this.assertSuperAdmin(viewer);
    const existing = await this.prisma.companyValuation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Valuation snapshot not found");
    await this.prisma.companyValuation.delete({ where: { id } });
    return { success: true };
  }

  // ── Cap table (aggregate view) ──
  /**
   * Build the full cap table as of today:
   *   - latest CompanyValuation snapshot (or null if HR hasn't recorded one)
   *   - every active grant with computed vested shares + ownership %
   *   - aggregate totals (issued, vested, outstanding)
   *
   * The `holder` shape is uniform across employee and external grants;
   * `holder.kind` tells the UI which path to render.
   */
  async capTable(viewer: CurrentUser) {
    this.assertHrOnly(viewer);
    const [grants, latestValuation] = await Promise.all([
      this.prisma.equityGrant.findMany({
        where: { status: EquityGrantStatus.ACTIVE },
        include: {
          employee: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } },
        },
        orderBy: { grantDate: "asc" },
      }),
      this.prisma.companyValuation.findFirst({ orderBy: { asOf: "desc" } }),
    ]);

    const today = new Date();
    const totalIssued = grants.reduce((acc, g) => acc + g.shares, 0);
    const denom =
      latestValuation && latestValuation.totalShares > 0
        ? latestValuation.totalShares
        : totalIssued;
    const sharePrice = latestValuation ? num(latestValuation.sharePrice) : 0;

    const rows = grants.map((g) => {
      const vested = vestedShares(g, today);
      const ownershipPct = denom > 0 ? (g.shares / denom) * 100 : 0;
      const vestedPct = denom > 0 ? (vested / denom) * 100 : 0;
      const holder = g.employee
        ? {
            kind: "EMPLOYEE" as const,
            userId: g.employee.user.id,
            employeeId: g.employee.id,
            name: `${g.employee.user.firstName} ${g.employee.user.lastName}`.trim() || g.employee.user.email,
            email: g.employee.user.email as string | null,
            organization: null as string | null,
          }
        : {
            kind: "EXTERNAL" as const,
            userId: null as string | null,
            employeeId: null as string | null,
            name: g.holderName ?? "(unnamed holder)",
            email: g.holderEmail,
            organization: g.organization,
          };
      return {
        id: g.id,
        type: g.type,
        status: g.status,
        grantDate: g.grantDate,
        vestingMonths: g.vestingMonths,
        cliffMonths: g.cliffMonths,
        shares: g.shares,
        vested,
        ownershipPct,
        vestedPct,
        valueAtCurrent: vested * sharePrice,
        investmentAmount: g.investmentAmount != null ? num(g.investmentAmount) : null,
        investmentDate: g.investmentDate,
        notes: g.notes,
        holder,
      };
    });

    const totalVested = rows.reduce((acc, r) => acc + r.vested, 0);
    const totalInvested = rows.reduce((acc, r) => acc + (r.investmentAmount ?? 0), 0);

    return {
      asOf: today,
      valuation: latestValuation
        ? {
            totalShares: latestValuation.totalShares,
            sharePrice,
            asOf: latestValuation.asOf,
            companyValuation: latestValuation.totalShares * sharePrice,
          }
        : null,
      totals: {
        issued: totalIssued,
        vested: totalVested,
        outstanding: totalIssued - totalVested,
        denominator: denom,
        cashInvested: totalInvested,
      },
      grants: rows,
    };
  }

  // ── Founder dashboard ──
  /**
   * Combined per-founder dashboard payload. One DB pass per founder so
   * the page renders in a single network round-trip. Returns an empty
   * list (not 404) when no founders exist yet.
   */
  async dashboard(viewer: CurrentUser) {
    this.assertHrOnly(viewer);
    const founders = await this.prisma.employeeProfile.findMany({
      where: { isFounder: true, terminatedAt: null },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } } },
    });
    if (founders.length === 0) return { founders: [], capTable: null };
    const today = new Date();
    const latestValuation = await this.prisma.companyValuation.findFirst({
      orderBy: { asOf: "desc" },
    });
    const denom = latestValuation?.totalShares ?? 0;
    const sharePrice = latestValuation ? num(latestValuation.sharePrice) : 0;

    // Batch-fetch all dependent rows in three queries instead of 3×N. With
    // N founders the old code issued 3N round trips; here we group in
    // memory. Empty buckets default to zero so a founder with no entries
    // still renders.
    const founderIds = founders.map((f) => f.id);
    const [ledgerEntries, slipDeferredAggs, activeGrants] = await Promise.all([
      this.prisma.founderLedgerEntry.findMany({
        where: { employeeId: { in: founderIds } },
        select: { employeeId: true, direction: true, amount: true },
      }),
      this.prisma.paySlip.groupBy({
        by: ["employeeId"],
        where: { employeeId: { in: founderIds } },
        _sum: { deferredAmount: true },
      }),
      this.prisma.equityGrant.findMany({
        where: { employeeId: { in: founderIds }, status: EquityGrantStatus.ACTIVE },
      }),
    ]);

    const entriesBy = new Map<string, typeof ledgerEntries>();
    for (const e of ledgerEntries) {
      const bucket = entriesBy.get(e.employeeId) ?? [];
      bucket.push(e);
      entriesBy.set(e.employeeId, bucket);
    }
    const deferredBy = new Map<string, number>();
    for (const s of slipDeferredAggs) {
      deferredBy.set(s.employeeId, num(s._sum.deferredAmount));
    }
    const grantsBy = new Map<string, typeof activeGrants>();
    for (const g of activeGrants) {
      // employeeId is nullable since the external-holder migration —
      // skip grants held by non-founders here, they're surfaced
      // elsewhere on the cap table.
      if (!g.employeeId) continue;
      const bucket = grantsBy.get(g.employeeId) ?? [];
      bucket.push(g);
      grantsBy.set(g.employeeId, bucket);
    }

    const rows = founders.map((f) => {
      const entries = entriesBy.get(f.id) ?? [];
      const grants = grantsBy.get(f.id) ?? [];
      const credits = entries
        .filter((e) => e.direction === FounderLedgerDirection.CREDIT)
        .reduce((acc, e) => acc + num(e.amount), 0);
      const debits = entries
        .filter((e) => e.direction === FounderLedgerDirection.DEBIT)
        .reduce((acc, e) => acc + num(e.amount), 0);
      const deferred = deferredBy.get(f.id) ?? 0;
      const capitalBalance = credits + deferred - debits;

      const totalShares = grants.reduce((a, g) => a + g.shares, 0);
      const vested = grants.reduce((a, g) => a + vestedShares(g, today), 0);
      const ownershipPct = denom > 0 ? (totalShares / denom) * 100 : 0;
      const vestedValue = vested * sharePrice;

      return {
        userId: f.userId,
        employeeId: f.id,
        name: `${f.user.firstName} ${f.user.lastName}`.trim() || f.user.email,
        email: f.user.email,
        avatarUrl: f.user.avatarUrl,
        capitalBalance,
        deferredSalary: deferred,
        ledgerCredits: credits,
        ledgerDebits: debits,
        shares: totalShares,
        vested,
        ownershipPct,
        vestedValue,
      };
    });

    return {
      founders: rows.sort((a, b) => b.capitalBalance - a.capitalBalance),
      capTable: latestValuation
        ? {
            asOf: latestValuation.asOf,
            totalShares: latestValuation.totalShares,
            sharePrice,
            companyValuation: latestValuation.totalShares * sharePrice,
          }
        : null,
    };
  }
}
