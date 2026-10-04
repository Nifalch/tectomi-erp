import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { PerformanceReviewsModule } from "../performance-reviews/performance-reviews.module";
import { AttendanceController } from "./attendance.controller";
import { AttendanceService } from "./attendance.service";

@Module({
  imports: [NotificationsModule, PerformanceReviewsModule],
  controllers: [AttendanceController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
