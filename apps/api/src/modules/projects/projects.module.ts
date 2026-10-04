import { Module } from "@nestjs/common";
import { ChatModule } from "../chat/chat.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AiModule } from "../ai/ai.module";
import { ProjectsController } from "./projects.controller";
import { ProjectsService } from "./projects.service";
import { PaymentMilestonesService } from "./payment-milestones.service";

@Module({
  imports: [ChatModule, NotificationsModule, AiModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, PaymentMilestonesService],
  exports: [ProjectsService, PaymentMilestonesService],
})
export class ProjectsModule {}
