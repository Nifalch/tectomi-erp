import { Module } from "@nestjs/common";
import { TeamToolsController } from "./team-tools.controller";
import { TeamToolsService } from "./team-tools.service";

@Module({
  controllers: [TeamToolsController],
  providers: [TeamToolsService],
})
export class TeamToolsModule {}
