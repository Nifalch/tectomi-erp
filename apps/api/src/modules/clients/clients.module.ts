import { Module } from "@nestjs/common";
import { ClientPortalModule } from "../client-portal/client-portal.module";
import { ClientsController } from "./clients.controller";
import { ClientsService } from "./clients.service";
import { PortalContactsController } from "./portal-contacts.controller";
import { PortalContactsService } from "./portal-contacts.service";
import { StaffRequestsController } from "./staff-requests.controller";
import { StaffRequestsService } from "./staff-requests.service";

@Module({
  imports: [ClientPortalModule],
  controllers: [ClientsController, PortalContactsController, StaffRequestsController],
  // MailService is provided by the global MailModule.
  providers: [ClientsService, PortalContactsService, StaffRequestsService],
  exports: [ClientsService],
})
export class ClientsModule {}
