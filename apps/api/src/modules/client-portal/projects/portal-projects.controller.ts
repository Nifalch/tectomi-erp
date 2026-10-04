import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { ClientPortalGuard } from "../client-portal.guard";
import { Portal, PortalContext } from "../portal-context.decorator";
import { PortalProjectsService } from "./portal-projects.service";

@Controller("client-portal/projects")
@UseGuards(ClientPortalGuard)
export class PortalProjectsController {
  constructor(private readonly svc: PortalProjectsService) {}

  @Get()
  list(@Portal() portal: PortalContext) {
    return this.svc.list(portal.clientId);
  }

  @Get(":id")
  detail(@Portal() portal: PortalContext, @Param("id") id: string) {
    return this.svc.detail(portal.clientId, id);
  }

  @Get(":id/tasks")
  tasks(@Portal() portal: PortalContext, @Param("id") id: string) {
    return this.svc.tasks(portal.clientId, id);
  }
}
