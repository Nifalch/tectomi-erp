import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { RecurringExpensesService } from "./recurring-expenses.service";
import { CreateRecurringExpenseDto, UpdateRecurringExpenseDto } from "./dto/recurring-expense.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("recurring-expenses")
export class RecurringExpensesController {
  constructor(private readonly service: RecurringExpensesService) {}

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER)
  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER)
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.service.findOne(id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER)
  @Post()
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateRecurringExpenseDto) {
    return this.service.create(user.id, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER)
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateRecurringExpenseDto) {
    return this.service.update(id, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER)
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.service.remove(id);
  }

  /**
   * Convert every active template whose next-due date is on or before
   * today into a real Payment + GL entry. Safe to call repeatedly — the
   * idempotency key is the period anchor stored on the template.
   */
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER)
  @Post("generate-due")
  generateDue(@CurrentUser() user: { id: string }) {
    return this.service.generateDue(user.id);
  }
}
