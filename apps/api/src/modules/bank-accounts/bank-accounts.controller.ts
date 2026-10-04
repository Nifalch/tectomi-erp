import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { PaginationDto } from "../../common/pagination/pagination.dto";
import { BankAccountsService } from "./bank-accounts.service";
import { CreateBankAccountDto, CreateBankTransactionDto, UpdateBankAccountDto } from "./dto/bank-account.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("bank-accounts")
export class BankAccountsController {
  constructor(private readonly service: BankAccountsService) {}

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
  create(@Body() dto: CreateBankAccountDto) {
    return this.service.create(dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER)
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateBankAccountDto) {
    return this.service.update(id, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN)
  @Delete(":id")
  remove(@Param("id") id: string, @Query("force") force?: string) {
    return this.service.remove(id, { force: force === "true" || force === "1" });
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER)
  @Get(":id/transactions")
  listTxns(@Param("id") id: string, @Query() query: PaginationDto) {
    return this.service.listTransactions(id, query);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER)
  @Post(":id/transactions")
  createTxn(@Param("id") id: string, @Body() dto: CreateBankTransactionDto) {
    return this.service.createTransaction(id, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER)
  @Post(":id/transactions/:txnId/reconcile")
  reconcile(@Param("id") id: string, @Param("txnId") txnId: string) {
    return this.service.reconcile(id, txnId);
  }
}
