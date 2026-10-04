import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { PerformanceReviewsController } from "./performance-reviews.controller";
import { PerformanceReviewsService } from "./performance-reviews.service";

@Module({
  imports: [NotificationsModule],
  controllers: [PerformanceReviewsController],
  providers: [PerformanceReviewsService],
  exports: [PerformanceReviewsService],
})
export class PerformanceReviewsModule {}
