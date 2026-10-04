import { Module } from "@nestjs/common";
import { ProjectExpensesController } from "./project-expenses.controller";
import { ProjectExpensesService } from "./project-expenses.service";

@Module({
  controllers: [ProjectExpensesController],
  providers: [ProjectExpensesService],
  exports: [ProjectExpensesService],
})
export class ProjectExpensesModule {}
