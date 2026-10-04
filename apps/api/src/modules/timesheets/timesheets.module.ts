import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { TimesheetsController } from "./timesheets.controller";
import { TimesheetsService } from "./timesheets.service";

@Module({
  imports: [NotificationsModule],
  controllers: [TimesheetsController],
  providers: [TimesheetsService],
})
export class TimesheetsModule {}
