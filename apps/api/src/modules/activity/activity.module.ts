import { Module } from "@nestjs/common";
import { ActivityController } from "./activity.controller";
import { ActivityLogService } from "./activity.service";

@Module({
  controllers: [ActivityController],
  providers: [ActivityLogService],
  exports: [ActivityLogService],
})
export class ActivityModule {}
