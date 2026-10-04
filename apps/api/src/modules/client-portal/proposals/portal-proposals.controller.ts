import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import type { Request } from "express";
import { ClientPortalGuard } from "../client-portal.guard";
import { Portal, PortalContext } from "../portal-context.decorator";
import { DecideDto } from "./dto";
import { PortalProposalsService } from "./portal-proposals.service";

@Controller("client-portal/proposals")
@UseGuards(ClientPortalGuard, ThrottlerGuard)
export class PortalProposalsController {
  constructor(private readonly svc: PortalProposalsService) {}

  @Get()
  list(@Portal() p: PortalContext) {
    return this.svc.list(p.clientId);
  }

  @Get(":id")
  detail(@Portal() p: PortalContext, @Param("id") id: string) {
    return this.svc.detail(p.clientId, id);
  }

  @Post(":id/decide")
  @Throttle({ default: { limit: 10, ttl: 60 * 60 * 1000 } })
  decide(
    @Portal() p: PortalContext,
    @Param("id") id: string,
    @Body() dto: DecideDto,
    @Req() req: Request,
  ) {
    return this.svc.decide(
      p.clientId,
      p.contactId,
      id,
      dto,
      req.ip ?? "",
      req.headers["user-agent"] ?? "",
    );
  }
}
