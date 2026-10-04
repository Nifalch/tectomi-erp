import { Controller, Get, UseGuards } from "@nestjs/common";
import { ClientPortalGuard } from "../client-portal.guard";
import { Portal, PortalContext } from "../portal-context.decorator";
import { PortalMeService } from "./portal-me.service";

@Controller("client-portal")
@UseGuards(ClientPortalGuard)
export class PortalMeController {
  constructor(private readonly svc: PortalMeService) {}

  @Get("me")
  me(@Portal() p: PortalContext) {
    return this.svc.me(p.contactId, p.clientId);
  }

  @Get("dashboard")
  dashboard(@Portal() p: PortalContext) {
    return this.svc.dashboard(p.clientId);
  }
}
