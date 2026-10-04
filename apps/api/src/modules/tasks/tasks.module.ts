import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { TimeModule } from "../time/time.module";
import { TasksController } from "./tasks.controller";
import { TasksService } from "./tasks.service";

@Module({
  imports: [NotificationsModule, TimeModule],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
