import { Module } from "@nestjs/common";
import { RecurringInvoicesController } from "./recurring-invoices.controller";
import { RecurringInvoicesService } from "./recurring-invoices.service";

@Module({
  controllers: [RecurringInvoicesController],
  providers: [RecurringInvoicesService],
})
export class RecurringInvoicesModule {}
