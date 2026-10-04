import { Controller, Get, Param, Query, Res, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import type { Response } from "express";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { ReportsService } from "./reports.service";

const FINANCE_ROLES = [RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER] as const;

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("reports")
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.FINANCE_MANAGER)
  @Get("profitability")
  profitability() {
    return this.reportsService.profitability();
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Get("productivity")
  productivity() {
    return this.reportsService.productivity();
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.FINANCE_MANAGER)
  @Get("profitability.csv")
  async profitabilityCsv(@Res() response: Response) {
    const rows = await this.reportsService.profitability();
    const csv = ["Project,Budget,Billed,Logged Hours,Profitability"]
      .concat(rows.map((row) => `${row.name},${row.budget},${row.billed},${row.loggedHours},${row.profitability}`))
      .join("\n");

    response.setHeader("Content-Type", "text/csv");
    response.setHeader("Content-Disposition", 'attachment; filename="profitability-report.csv"');
    response.send(csv);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Get("productivity.csv")
  async productivityCsv(@Res() response: Response) {
    const rows = await this.reportsService.productivity();
    const csv = ["Name,Department,Task Count,Logged Hours"]
      .concat(rows.map((row) => `${row.name},${row.department},${row.taskCount},${row.loggedHours}`))
      .join("\n");

    response.setHeader("Content-Type", "text/csv");
    response.setHeader("Content-Disposition", 'attachment; filename="productivity-report.csv"');
    response.send(csv);
  }

  // ──────────────────────────────────────────────────────────────────
  // Zoho-style financial reports
  // ──────────────────────────────────────────────────────────────────

  @Roles(...FINANCE_ROLES)
  @Get("profit-loss")
  profitLoss(@Query("from") from?: string, @Query("to") to?: string) {
    return this.reportsService.profitLoss(from, to);
  }

  @Roles(...FINANCE_ROLES)
  @Get("balance-sheet")
  balanceSheet(@Query("from") from?: string, @Query("to") to?: string) {
    return this.reportsService.balanceSheet(from, to);
  }

  @Roles(...FINANCE_ROLES)
  @Get("trial-balance")
  trialBalance(@Query("from") from?: string, @Query("to") to?: string) {
    return this.reportsService.trialBalance(from, to);
  }

  @Roles(...FINANCE_ROLES)
  @Get("cash-flow")
  cashFlow(@Query("from") from?: string, @Query("to") to?: string) {
    return this.reportsService.cashFlow(from, to);
  }

  @Roles(...FINANCE_ROLES)
  @Get("ar-aging")
  arAging(@Query("from") from?: string, @Query("to") to?: string) {
    return this.reportsService.arAging(from, to);
  }

  @Roles(...FINANCE_ROLES)
  @Get("ap-aging")
  apAging(@Query("from") from?: string, @Query("to") to?: string) {
    return this.reportsService.apAging(from, to);
  }

  @Roles(...FINANCE_ROLES)
  @Get("tax-summary")
  taxSummary(@Query("from") from?: string, @Query("to") to?: string) {
    return this.reportsService.taxSummary(from, to);
  }

  @Roles(...FINANCE_ROLES)
  @Get("sales-by-customer")
  salesByCustomer(@Query("from") from?: string, @Query("to") to?: string) {
    return this.reportsService.salesByCustomer(from, to);
  }

  @Roles(...FINANCE_ROLES)
  @Get("expenses-by-category")
  expensesByCategory(@Query("from") from?: string, @Query("to") to?: string) {
    return this.reportsService.expensesByCategory(from, to);
  }

  @Roles(...FINANCE_ROLES)
  @Get("customer-statement/:clientId")
  customerStatement(
    @Param("clientId") clientId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.reportsService.customerStatement(clientId, from, to);
  }
}
