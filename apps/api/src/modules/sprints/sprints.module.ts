import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { SprintsController } from "./sprints.controller";
import { SprintsService } from "./sprints.service";

@Module({
  imports: [NotificationsModule],
  controllers: [SprintsController],
  providers: [SprintsService],
  exports: [SprintsService],
})
export class SprintsModule {}
