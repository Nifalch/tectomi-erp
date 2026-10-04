import { Controller, Get, Param, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { ClientPortalGuard } from "../client-portal.guard";
import { Portal, PortalContext } from "../portal-context.decorator";
import { PortalInvoicesService } from "./portal-invoices.service";
import { InvoicesService } from "../../invoices/invoices.service";

@Controller("client-portal/invoices")
@UseGuards(ClientPortalGuard)
export class PortalInvoicesController {
  constructor(
    private readonly svc: PortalInvoicesService,
    private readonly staff: InvoicesService,
  ) {}

  @Get()
  list(@Portal() p: PortalContext) {
    return this.svc.list(p.clientId);
  }

  @Get(":id")
  detail(@Portal() p: PortalContext, @Param("id") id: string) {
    return this.svc.detail(p.clientId, id);
  }

  @Get(":id/pdf")
  async pdf(@Portal() p: PortalContext, @Param("id") id: string, @Res() res: Response) {
    await this.svc.assertOwned(p.clientId, id);
    const buffer = await this.staff.exportPdf(id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="invoice-${id}.pdf"`);
    return res.send(buffer);
  }
}
