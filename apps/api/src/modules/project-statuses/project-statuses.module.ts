import { Module } from "@nestjs/common";
import { ProjectStatusesController } from "./project-statuses.controller";
import { ProjectStatusesService } from "./project-statuses.service";

@Module({
  controllers: [ProjectStatusesController],
  providers: [ProjectStatusesService],
})
export class ProjectStatusesModule {}
