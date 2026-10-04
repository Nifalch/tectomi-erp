import {
  Body,
  Controller,
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
import { PaginationDto } from "../../common/pagination/pagination.dto";
import { CreatePayrollRunDto } from "./dto/create-payroll-run.dto";
import { ListPaySlipsDto } from "./dto/list-pay-slips.dto";
import {
  UpdateSalaryStructureDto,
  UpsertSalaryStructureDto,
} from "./dto/upsert-salary-structure.dto";
import { PayrollService } from "./payroll.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("payroll")
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  // ── Salary Structures ──
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Get("salary-structures")
  listSalaryStructures() {
    return this.payrollService.listSalaryStructures();
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Get("salary-structures/employee/:employeeId")
  getSalaryStructureByEmployee(@Param("employeeId") employeeId: string) {
    return this.payrollService.getSalaryStructureByEmployee(employeeId);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR_MANAGER)
  @Post("salary-structures")
  upsertSalaryStructure(@Body() dto: UpsertSalaryStructureDto) {
    return this.payrollService.upsertSalaryStructure(dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR_MANAGER)
  @Patch("salary-structures/:id")
  updateSalaryStructure(@Param("id") id: string, @Body() dto: UpdateSalaryStructureDto) {
    return this.payrollService.updateSalaryStructure(id, dto);
  }

  // ── Payroll Runs ──
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Get("runs")
  listRuns(@Query() query: PaginationDto) {
    return this.payrollService.listRuns(query);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Get("runs/:id")
  getRun(@Param("id") id: string) {
    return this.payrollService.getRun(id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR_MANAGER)
  @Post("runs")
  createRun(@Body() dto: CreatePayrollRunDto) {
    return this.payrollService.createRun(dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR_MANAGER)
  @Post("runs/:id/process")
  processRun(@Param("id") id: string, @CurrentUser() user: { id: string }) {
    return this.payrollService.processRun(id, user.id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR_MANAGER)
  @Post("runs/:id/mark-paid")
  markRunPaid(@Param("id") id: string, @CurrentUser() user: { id: string }) {
    return this.payrollService.markRunPaid(id, user.id);
  }

  // ── Pay Slips ──
  @Roles(
    RoleCode.SUPER_ADMIN,
    RoleCode.ADMIN,
    RoleCode.HR_MANAGER,
    RoleCode.EMPLOYEE,
    RoleCode.PROJECT_MANAGER,
    RoleCode.FINANCE_MANAGER,
  )
  @Get("slips")
  listPaySlips(
    @CurrentUser() user: { id: string; roles?: RoleCode[] },
    @Query() query: ListPaySlipsDto,
  ) {
    return this.payrollService.listPaySlips(user, query);
  }

  @Roles(
    RoleCode.SUPER_ADMIN,
    RoleCode.ADMIN,
    RoleCode.HR_MANAGER,
    RoleCode.EMPLOYEE,
    RoleCode.PROJECT_MANAGER,
    RoleCode.FINANCE_MANAGER,
  )
  @Get("slips/my")
  listMyPaySlips(@CurrentUser() user: { id: string }) {
    return this.payrollService.listMyPaySlips(user.id);
  }

  @Roles(
    RoleCode.SUPER_ADMIN,
    RoleCode.ADMIN,
    RoleCode.HR_MANAGER,
    RoleCode.EMPLOYEE,
    RoleCode.PROJECT_MANAGER,
    RoleCode.FINANCE_MANAGER,
  )
  @Get("slips/:id")
  getPaySlip(
    @Param("id") id: string,
    @CurrentUser() user: { id: string; roles?: RoleCode[] },
  ) {
    return this.payrollService.getPaySlip(id, user);
  }

  // ── Founder deferred-compensation ──
  // Set what a founder actually drew this month (vs the netSalary the
  // payslip says they were owed). The service computes deferredAmount
  // (= netSalary − drawnAmount, clamped to >= 0) and validates that the
  // employee is flagged isFounder. HR or the founder themselves can call.
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER, RoleCode.EMPLOYEE)
  @Patch("slips/:id/drawn")
  setDrawnAmount(
    @Param("id") id: string,
    @Body() dto: { drawnAmount: number },
    @CurrentUser() user: { id: string; roles?: RoleCode[] },
  ) {
    return this.payrollService.setDrawnAmount(id, user, dto.drawnAmount);
  }

  // Aggregate per-founder deferred totals (this-year + lifetime). Used by
  // the deferred-comp dashboard card. HR-only since it spans all founders;
  // an employee viewing their own profile pulls their own slips directly.
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Get("founder-summary")
  founderSummary() {
    return this.payrollService.founderDeferredSummary();
  }
}
