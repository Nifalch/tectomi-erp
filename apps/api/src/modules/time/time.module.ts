import { Module } from "@nestjs/common";
import { TimeController } from "./time.controller";
import { TimeService } from "./time.service";

@Module({
  controllers: [TimeController],
  providers: [TimeService],
  // Exported so TasksModule can auto-start/stop timers on status transitions.
  exports: [TimeService],
})
export class TimeModule {}

