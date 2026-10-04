import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { LeaveStatus, NotificationType, PaySlipStatus, PayrollStatus, Prisma, RoleCode } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { getPagination } from "../../common/pagination/pagination.dto";
import { AutoPostService } from "../finance/auto-post.service";
import { NotificationsService } from "../notifications/notifications.service";
import {
  UpdateSalaryStructureDto,
  UpsertSalaryStructureDto,
} from "./dto/upsert-salary-structure.dto";
import { CreatePayrollRunDto } from "./dto/create-payroll-run.dto";
import { ListPaySlipsDto } from "./dto/list-pay-slips.dto";

type CurrentUser = { id: string; roles?: RoleCode[] };

function toDecimal(value: number | undefined | null): Prisma.Decimal {
  return new Prisma.Decimal(value ?? 0);
}

function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  return Number(value.toString());
}

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autoPost: AutoPostService,
    private readonly notifications: NotificationsService,
  ) {}

  // ──────────────────────────
  // Salary Structures
  // ──────────────────────────

  async listSalaryStructures() {
    return this.prisma.salaryStructure.findMany({
      include: {
        employee: { include: { user: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async getSalaryStructureByEmployee(employeeId: string) {
    return this.prisma.salaryStructure.findUnique({
      where: { employeeId },
      include: { employee: { include: { user: true } } },
    });
  }

  async upsertSalaryStructure(dto: UpsertSalaryStructureDto) {
    const data = {
      basic: toDecimal(dto.basic),
      hra: toDecimal(dto.hra),
      conveyance: toDecimal(dto.conveyance),
      medical: toDecimal(dto.medical),
      specialAllowance: toDecimal(dto.specialAllowance),
      otherAllowance: toDecimal(dto.otherAllowance),
      pfDeduction: toDecimal(dto.pfDeduction),
      taxDeduction: toDecimal(dto.taxDeduction),
      otherDeductions: toDecimal(dto.otherDeductions),
      effectiveFrom: new Date(dto.effectiveFrom),
    };
    return this.prisma.salaryStructure.upsert({
      where: { employeeId: dto.employeeId },
      create: { employeeId: dto.employeeId, ...data },
      update: data,
    });
  }

  async updateSalaryStructure(id: string, dto: UpdateSalaryStructureDto) {
    const data: Prisma.SalaryStructureUpdateInput = {};
    if (dto.basic !== undefined) data.basic = toDecimal(dto.basic);
    if (dto.hra !== undefined) data.hra = toDecimal(dto.hra);
    if (dto.conveyance !== undefined) data.conveyance = toDecimal(dto.conveyance);
    if (dto.medical !== undefined) data.medical = toDecimal(dto.medical);
    if (dto.specialAllowance !== undefined) data.specialAllowance = toDecimal(dto.specialAllowance);
    if (dto.otherAllowance !== undefined) data.otherAllowance = toDecimal(dto.otherAllowance);
    if (dto.pfDeduction !== undefined) data.pfDeduction = toDecimal(dto.pfDeduction);
    if (dto.taxDeduction !== undefined) data.taxDeduction = toDecimal(dto.taxDeduction);
    if (dto.otherDeductions !== undefined) data.otherDeductions = toDecimal(dto.otherDeductions);
    if (dto.effectiveFrom !== undefined) data.effectiveFrom = new Date(dto.effectiveFrom);
    return this.prisma.salaryStructure.update({ where: { id }, data });
  }

  // ──────────────────────────
  // Payroll Runs
  // ──────────────────────────

  async listRuns(query: { page?: number; pageSize?: number }) {
    const { skip, take, page, pageSize } = getPagination({
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 10,
    } as any);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.payrollRun.findMany({
        skip,
        take,
        include: {
          processedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
          _count: { select: { slips: true } },
        },
        orderBy: [{ year: "desc" }, { month: "desc" }],
      }),
      this.prisma.payrollRun.count(),
    ]);

    return {
      data,
      meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
    };
  }

  async getRun(id: string) {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id },
      include: {
        slips: {
          include: { employee: { include: { user: true } } },
        },
      },
    });
    if (!run) throw new NotFoundException("Payroll run not found");
    return run;
  }

  async createRun(dto: CreatePayrollRunDto) {
    const existing = await this.prisma.payrollRun.findUnique({
      where: { month_year: { month: dto.month, year: dto.year } },
    });
    if (existing) throw new BadRequestException("Payroll run for this month/year already exists");
    return this.prisma.payrollRun.create({
      data: { month: dto.month, year: dto.year, status: PayrollStatus.DRAFT },
    });
  }

  async processRun(id: string, currentUserId: string) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException("Payroll run not found");
    if (run.status !== PayrollStatus.DRAFT) {
      throw new BadRequestException("Only DRAFT runs can be processed");
    }

    const employees = await this.prisma.employeeProfile.findMany({
      include: { salaryStructure: true, user: true },
    });

    const monthStart = new Date(Date.UTC(run.year, run.month - 1, 1));
    const monthEnd = new Date(Date.UTC(run.year, run.month, 0, 23, 59, 59));

    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;

    for (const emp of employees) {
      const ss = emp.salaryStructure;
      if (!ss) continue;

      const basic = decimalToNumber(ss.basic);
      const hra = decimalToNumber(ss.hra);
      const conveyance = decimalToNumber(ss.conveyance);
      const medical = decimalToNumber(ss.medical);
      const specialAllowance = decimalToNumber(ss.specialAllowance);
      const otherAllowance = decimalToNumber(ss.otherAllowance);
      const pfDeduction = decimalToNumber(ss.pfDeduction);
      const taxDeduction = decimalToNumber(ss.taxDeduction);
      const otherDeductions = decimalToNumber(ss.otherDeductions);

      const grossSalary = basic + hra + conveyance + medical + specialAllowance + otherAllowance;
      const allowances = conveyance + medical + specialAllowance + otherAllowance;
      const deductionsTotal = pfDeduction + taxDeduction + otherDeductions;

      const approvedLeaves = await this.prisma.leaveRequest.findMany({
        where: {
          userId: emp.userId,
          status: LeaveStatus.APPROVED,
          startDate: { lte: monthEnd },
          endDate: { gte: monthStart },
        },
      });

      // Clamp each leave to the payroll-month window before counting. A
      // leave spanning Mar 31 → Apr 1 used to be billed in FULL on BOTH
      // the March and April payslips because the previous logic trusted
      // the leave's total days. Now we count only the days that actually
      // fall inside the month being processed.
      const MS_PER_DAY = 24 * 60 * 60 * 1000;
      let totalLeaveDays = 0;
      let unpaidLeaveDays = 0;
      for (const l of approvedLeaves) {
        const start = l.startDate < monthStart ? monthStart : l.startDate;
        const end = l.endDate > monthEnd ? monthEnd : l.endDate;
        // +1 because endDate is inclusive (Mar 31 → Mar 31 = 1 day).
        let daysInMonth = Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
        if (daysInMonth <= 0) continue;
        // Half-days are recorded as a single-day range with isHalfDay=true.
        // Honor that when the clamp didn't cut off either edge of the row.
        if (l.isHalfDay && l.startDate >= monthStart && l.endDate <= monthEnd) {
          daysInMonth = 0.5;
        }
        totalLeaveDays += daysInMonth;
        if (!l.isPaid) unpaidLeaveDays += daysInMonth;
      }

      const workingDays = 22;
      const paidDays = Math.max(0, workingDays - unpaidLeaveDays);
      const dailyRate = workingDays > 0 ? grossSalary / workingDays : 0;
      // Round to 2 dp so net stays a clean currency number.
      const unpaidDeduction = Math.round(dailyRate * unpaidLeaveDays * 100) / 100;
      const netSalary = Math.max(0, grossSalary - deductionsTotal - unpaidDeduction);

      await this.prisma.paySlip.upsert({
        where: { payrollRunId_employeeId: { payrollRunId: run.id, employeeId: emp.id } },
        create: {
          payrollRunId: run.id,
          employeeId: emp.id,
          month: run.month,
          year: run.year,
          basic: toDecimal(basic),
          hra: toDecimal(hra),
          allowances: toDecimal(allowances),
          grossSalary: toDecimal(grossSalary),
          pfDeduction: toDecimal(pfDeduction),
          taxDeduction: toDecimal(taxDeduction),
          otherDeductions: toDecimal(otherDeductions + unpaidDeduction),
          netSalary: toDecimal(netSalary),
          workingDays,
          paidDays,
          leaveDays: totalLeaveDays,
          status: PaySlipStatus.PENDING,
        },
        update: {
          basic: toDecimal(basic),
          hra: toDecimal(hra),
          allowances: toDecimal(allowances),
          grossSalary: toDecimal(grossSalary),
          pfDeduction: toDecimal(pfDeduction),
          taxDeduction: toDecimal(taxDeduction),
          otherDeductions: toDecimal(otherDeductions + unpaidDeduction),
          netSalary: toDecimal(netSalary),
          workingDays,
          paidDays,
          leaveDays: totalLeaveDays,
        },
      });

      totalGross += grossSalary;
      totalDeductions += deductionsTotal + unpaidDeduction;
      totalNet += netSalary;
    }

    return this.prisma.payrollRun.update({
      where: { id: run.id },
      data: {
        status: PayrollStatus.PROCESSED,
        processedAt: new Date(),
        processedById: currentUserId,
        totalGross: toDecimal(totalGross),
        totalDeductions: toDecimal(totalDeductions),
        totalNet: toDecimal(totalNet),
      },
    });
  }

  async markRunPaid(id: string, actorId?: string) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException("Payroll run not found");
    if (run.status !== PayrollStatus.PROCESSED) {
      throw new BadRequestException("Only PROCESSED runs can be marked paid");
    }
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.payrollRun.update({
        where: { id },
        data: { status: PayrollStatus.PAID },
      }),
      this.prisma.paySlip.updateMany({
        where: { payrollRunId: id },
        data: { status: PaySlipStatus.PAID, paidAt: now },
      }),
    ]);
    // Auto-post each slip to the GL (debit Salary Expense, credit Cash).
    // Idempotent — re-marking a run silently no-ops on already-posted slips.
    // We let any post failure log instead of rolling back the run-marking,
    // since the run is already in PAID state and the bookkeeping can be
    // re-tried via /finance/backfill.
    if (actorId) {
      const slips = await this.prisma.paySlip.findMany({
        where: { payrollRunId: id },
        select: { id: true },
      });
      for (const s of slips) {
        try {
          await this.autoPost.postPaySlip(s.id, actorId);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("[AutoPost] Failed to post payslip", s.id, err);
        }
      }
    }

    // Notify each employee that their pay slip is ready (link to the
    // print view so they can download it). Best-effort.
    try {
      const slipsWithEmployee = await this.prisma.paySlip.findMany({
        where: { payrollRunId: id },
        select: {
          id: true,
          netSalary: true,
          employee: { select: { userId: true } },
        },
      });
      const monthLabel = new Date(run.year, run.month - 1, 1)
        .toLocaleDateString("en-IN", { month: "long", year: "numeric" });
      await Promise.all(
        slipsWithEmployee
          .filter((s) => s.employee?.userId)
          .map((s) =>
            this.notifications.create(s.employee!.userId, {
              type: NotificationType.GENERIC,
              title: `Pay slip ready: ${monthLabel}`,
              body: `Your ${monthLabel} pay slip has been processed. Net ₹${Number(s.netSalary).toLocaleString("en-IN", { maximumFractionDigits: 0 })}.`,
              link: `/payroll/slips/${s.id}/print`,
            }).catch(() => undefined),
          ),
      );
    } catch {
      /* non-fatal */
    }

    return this.prisma.payrollRun.findUnique({ where: { id } });
  }

  // ──────────────────────────
  // Pay Slips
  // ──────────────────────────

  async listPaySlips(currentUser: CurrentUser, query: ListPaySlipsDto) {
    const { skip, take, page, pageSize } = getPagination(query);
    const isHr =
      currentUser.roles?.includes(RoleCode.SUPER_ADMIN) ||
      currentUser.roles?.includes(RoleCode.ADMIN) ||
      currentUser.roles?.includes(RoleCode.HR_MANAGER);

    const where: Prisma.PaySlipWhereInput = {};
    if (query.employeeId) where.employeeId = query.employeeId;
    if (query.runId) where.payrollRunId = query.runId;
    if (query.month) where.month = query.month;
    if (query.year) where.year = query.year;

    if (!isHr) {
      const profile = await this.prisma.employeeProfile.findUnique({
        where: { userId: currentUser.id },
        select: { id: true },
      });
      if (!profile) {
        return {
          data: [],
          meta: { page, pageSize, total: 0, pageCount: 0 },
        };
      }
      where.employeeId = profile.id;
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.paySlip.findMany({
        where,
        skip,
        take,
        include: {
          employee: { include: { user: true } },
          payrollRun: true,
        },
        orderBy: [{ year: "desc" }, { month: "desc" }],
      }),
      this.prisma.paySlip.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
    };
  }

  async getPaySlip(id: string, currentUser: CurrentUser) {
    const slip = await this.prisma.paySlip.findUnique({
      where: { id },
      include: {
        payrollRun: true,
        employee: { include: { user: true } },
      },
    });
    if (!slip) throw new NotFoundException("Pay slip not found");
    const isHr =
      currentUser.roles?.includes(RoleCode.SUPER_ADMIN) ||
      currentUser.roles?.includes(RoleCode.ADMIN) ||
      currentUser.roles?.includes(RoleCode.HR_MANAGER);
    if (!isHr && slip.employee.userId !== currentUser.id) {
      throw new ForbiddenException("Cannot access this pay slip");
    }
    return slip;
  }

  async listMyPaySlips(currentUserId: string) {
    const profile = await this.prisma.employeeProfile.findUnique({
      where: { userId: currentUserId },
      select: { id: true },
    });
    if (!profile) return [];
    return this.prisma.paySlip.findMany({
      where: { employeeId: profile.id },
      include: { payrollRun: true },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    });
  }

  // ── Founder deferred-compensation ──
  /**
   * Record what a founder actually drew this month (can be lower than the
   * netSalary the slip says they were owed — that gap is recorded as
   * deferredAmount and surfaced on the founder dashboard as a running
   * IOU from the company).
   *
   * Guards:
   *   - Slip must belong to a founder (isFounder = true on profile).
   *   - drawnAmount must be 0 ≤ x ≤ netSalary (we don't let a founder
   *     "draw more than owed" via this endpoint — that's a salary bump,
   *     which goes through SalaryStructure / a new payroll run).
   *   - Caller must be HR or the founder themselves.
   *
   * Returns the updated slip with computed deferredAmount.
   */
  async setDrawnAmount(slipId: string, currentUser: CurrentUser, rawDrawn: number) {
    const slip = await this.prisma.paySlip.findUnique({
      where: { id: slipId },
      include: { employee: { select: { userId: true, isFounder: true } } },
    });
    if (!slip) throw new NotFoundException("Pay slip not found");
    if (!slip.employee.isFounder) {
      throw new BadRequestException(
        "Deferred-compensation tracking is only available for co-founders.",
      );
    }
    const isHr =
      currentUser.roles?.includes(RoleCode.SUPER_ADMIN) ||
      currentUser.roles?.includes(RoleCode.ADMIN) ||
      currentUser.roles?.includes(RoleCode.HR_MANAGER);
    if (!isHr && slip.employee.userId !== currentUser.id) {
      throw new ForbiddenException("Cannot modify this pay slip");
    }
    const drawn = Number(rawDrawn);
    if (!Number.isFinite(drawn) || drawn < 0) {
      throw new BadRequestException("drawnAmount must be a non-negative number.");
    }
    const net = decimalToNumber(slip.netSalary);
    if (drawn > net) {
      throw new BadRequestException(
        `drawnAmount (${drawn}) cannot exceed the slip's netSalary (${net}). To raise the founder's salary, update their SalaryStructure and re-run payroll.`,
      );
    }
    const deferred = Math.max(0, net - drawn);
    return this.prisma.paySlip.update({
      where: { id: slipId },
      data: {
        drawnAmount: toDecimal(drawn),
        deferredAmount: toDecimal(deferred),
      },
      include: { payrollRun: true, employee: { include: { user: true } } },
    });
  }

  /**
   * Per-founder roll-up of deferred compensation:
   *   - lifetime total (sum of all deferredAmount on their slips)
   *   - YTD total (current calendar year)
   *   - count of slips with a non-zero deferred amount (months-subsidised)
   *
   * Used by the HR founder-dashboard card. Returns one row per founder.
   */
  async founderDeferredSummary() {
    const founders = await this.prisma.employeeProfile.findMany({
      where: { isFounder: true, terminatedAt: null },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
    if (founders.length === 0) return [];
    const year = new Date().getFullYear();
    const rows = await Promise.all(
      founders.map(async (f) => {
        const [lifetime, ytd, monthsSubsidised] = await Promise.all([
          this.prisma.paySlip.aggregate({
            where: { employeeId: f.id },
            _sum: { deferredAmount: true },
          }),
          this.prisma.paySlip.aggregate({
            where: { employeeId: f.id, year },
            _sum: { deferredAmount: true },
          }),
          this.prisma.paySlip.count({
            where: { employeeId: f.id, deferredAmount: { gt: 0 } },
          }),
        ]);
        return {
          userId: f.userId,
          employeeId: f.id,
          name: `${f.user.firstName} ${f.user.lastName}`.trim() || f.user.email,
          email: f.user.email,
          lifetimeDeferred: decimalToNumber(lifetime._sum.deferredAmount),
          ytdDeferred: decimalToNumber(ytd._sum.deferredAmount),
          monthsSubsidised,
        };
      }),
    );
    // Highest sacrifice first — easier for HR to see who's owed the most.
    return rows.sort((a, b) => b.lifetimeDeferred - a.lifetimeDeferred);
  }
}
