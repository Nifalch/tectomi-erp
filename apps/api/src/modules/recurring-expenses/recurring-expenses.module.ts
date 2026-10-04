import { Module } from "@nestjs/common";
import { FinanceModule } from "../finance/finance.module";
import { RecurringExpensesController } from "./recurring-expenses.controller";
import { RecurringExpensesService } from "./recurring-expenses.service";

@Module({
  imports: [FinanceModule],
  controllers: [RecurringExpensesController],
  providers: [RecurringExpensesService],
})
export class RecurringExpensesModule {}
