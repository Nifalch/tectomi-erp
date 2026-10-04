import { Module } from "@nestjs/common";
import { NotificationsController } from "./notifications.controller";
import { NotificationsGateway } from "./notifications.gateway";
import { NotificationsScheduler } from "./notifications.scheduler";
import { NotificationsService } from "./notifications.service";

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsGateway, NotificationsScheduler],
  exports: [NotificationsService],
})
export class NotificationsModule {}

