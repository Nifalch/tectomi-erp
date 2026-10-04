import { Body, Controller, Get, Param, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import type { Response } from "express";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { PaginationDto } from "../../common/pagination/pagination.dto";
import { CreateInvoiceDto, UpdateInvoiceDto } from "./dto/create-invoice.dto";
import { InvoicesService } from "./invoices.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("invoices")
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER, RoleCode.CLIENT)
  @Get()
  findAll(@Query() query: PaginationDto) {
    return this.invoicesService.findAll(query);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER, RoleCode.CLIENT)
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.invoicesService.findOne(id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER)
  @Post()
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateInvoiceDto) {
    return this.invoicesService.create(user.id, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER)
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateInvoiceDto) {
    return this.invoicesService.update(id, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER)
  @Patch(":id/send")
  send(@Param("id") id: string) {
    return this.invoicesService.send(id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER)
  @Patch(":id/pay")
  markPaid(@Param("id") id: string, @CurrentUser() user: { id: string }) {
    return this.invoicesService.markPaid(id, user.id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER, RoleCode.CLIENT)
  @Get(":id/pdf")
  async exportPdf(@Param("id") id: string, @Res() response: Response) {
    const file = await this.invoicesService.exportPdf(id);
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `attachment; filename="invoice-${id}.pdf"`);
    response.send(file);
  }
}
