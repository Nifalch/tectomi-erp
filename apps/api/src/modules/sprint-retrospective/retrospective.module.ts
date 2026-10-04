import { Module } from "@nestjs/common";
import { ProjectsModule } from "../projects/projects.module";
import { SprintRetrospectiveController } from "./retrospective.controller";
import { SprintRetrospectiveService } from "./retrospective.service";

@Module({
  imports: [ProjectsModule],
  controllers: [SprintRetrospectiveController],
  providers: [SprintRetrospectiveService],
})
export class SprintRetrospectiveModule {}
