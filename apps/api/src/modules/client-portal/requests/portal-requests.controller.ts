import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { ClientPortalGuard } from "../client-portal.guard";
import { Portal, PortalContext } from "../portal-context.decorator";
import { CreateRequestDto, ListQueryDto, ReplyDto } from "./dto";
import { PortalRequestsService } from "./portal-requests.service";

@Controller("client-portal/requests")
@UseGuards(ClientPortalGuard, ThrottlerGuard)
export class PortalRequestsController {
  constructor(private readonly svc: PortalRequestsService) {}

  @Get()
  list(@Portal() p: PortalContext, @Query() q: ListQueryDto) {
    return this.svc.list(p.clientId, q.status);
  }

  @Get(":id")
  detail(@Portal() p: PortalContext, @Param("id") id: string) {
    return this.svc.detail(p.clientId, id);
  }

  @Post()
  @Throttle({ default: { limit: 30, ttl: 60 * 60 * 1000 } })
  create(@Portal() p: PortalContext, @Body() dto: CreateRequestDto) {
    return this.svc.create(p.clientId, p.contactId, dto);
  }

  @Post(":id/messages")
  @Throttle({ default: { limit: 120, ttl: 60 * 60 * 1000 } })
  reply(@Portal() p: PortalContext, @Param("id") id: string, @Body() dto: ReplyDto) {
    return this.svc.reply(p.clientId, p.contactId, id, dto);
  }
}
