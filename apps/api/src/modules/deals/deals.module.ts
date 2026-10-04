import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { DealsController } from "./deals.controller";
import { DealsService } from "./deals.service";

@Module({
  imports: [NotificationsModule],
  controllers: [DealsController],
  providers: [DealsService],
  exports: [DealsService],
})
export class DealsModule {}
