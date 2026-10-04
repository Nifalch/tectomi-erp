import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { PerformanceReviewsModule } from "../performance-reviews/performance-reviews.module";
import { LeaveController } from "./leave.controller";
import { LeaveService } from "./leave.service";

@Module({
  imports: [NotificationsModule, PerformanceReviewsModule],
  controllers: [LeaveController],
  providers: [LeaveService],
  exports: [LeaveService],
})
export class LeaveModule {}
