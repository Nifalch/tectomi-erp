import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { AutoPostService } from "./auto-post.service";
import { CreateExpenseDto, CreateRevenueDto } from "./dto/finance.dto";
import { FinanceService } from "./finance.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("finance")
export class FinanceController {
  constructor(
    private readonly financeService: FinanceService,
    private readonly autoPost: AutoPostService,
  ) {}

  // Legacy quick-tracking dashboard (uses Expense / Revenue tables).
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER)
  @Get("summary")
  summary() {
    return this.financeService.summary();
  }

  // Proper double-entry GL dashboard — main account balance, MTD flows,
  // per-founder net, recent journal entries.
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER)
  @Get("main-account")
  mainAccount() {
    return this.financeService.mainAccount();
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER)
  @Post("expenses")
  createExpense(@CurrentUser() user: { id: string }, @Body() dto: CreateExpenseDto) {
    return this.financeService.createExpense(user.id, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER)
  @Post("revenues")
  createRevenue(@CurrentUser() user: { id: string }, @Body() dto: CreateRevenueDto) {
    return this.financeService.createRevenue(user.id, dto);
  }

  // Designate a BankAccount as the primary operating account. All
  // auto-posted journal entries for cash flow route through it.
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER)
  @Post("banks/:id/make-primary")
  setPrimaryBank(@Param("id") id: string) {
    return this.autoPost.setPrimaryBank(id);
  }

  // One-shot rebuild of journal entries from every existing Payment,
  // paid PaySlip, and FounderLedgerEntry. Idempotent — safe to re-run.
  // Returns counts so the UI can show "X entries created".
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  @Post("backfill")
  backfill(@CurrentUser() user: { id: string }) {
    return this.autoPost.backfillAll(user.id);
  }
}
