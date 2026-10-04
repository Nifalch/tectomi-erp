import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { InvoicesModule } from "../invoices/invoices.module";
import { ClientPortalGuard } from "./client-portal.guard";
import { PortalAuthController } from "./auth/portal-auth.controller";
import { PortalAuthService } from "./auth/portal-auth.service";
import { PortalProjectsController } from "./projects/portal-projects.controller";
import { PortalProjectsService } from "./projects/portal-projects.service";
import { PortalMeController } from "./me/portal-me.controller";
import { PortalMeService } from "./me/portal-me.service";
import { PortalProposalsController } from "./proposals/portal-proposals.controller";
import { PortalProposalsService } from "./proposals/portal-proposals.service";
import { PortalRequestsController } from "./requests/portal-requests.controller";
import { PortalRequestsService } from "./requests/portal-requests.service";
import { PortalInvoicesController } from "./invoices/portal-invoices.controller";
import { PortalInvoicesService } from "./invoices/portal-invoices.service";
import { PortalChatController } from "./chat/portal-chat.controller";
import { PortalChatService } from "./chat/portal-chat.service";

@Module({
  imports: [NotificationsModule, InvoicesModule],
  controllers: [PortalAuthController, PortalProjectsController, PortalMeController, PortalProposalsController, PortalRequestsController, PortalInvoicesController, PortalChatController],
  providers: [ClientPortalGuard, PortalAuthService, PortalProjectsService, PortalMeService, PortalProposalsService, PortalRequestsService, PortalInvoicesService, PortalChatService],
  exports: [ClientPortalGuard, PortalAuthService],
})
export class ClientPortalModule {}
