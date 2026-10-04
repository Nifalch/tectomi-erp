import { Module } from "@nestjs/common";
import { FinanceModule } from "../finance/finance.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PayrollController } from "./payroll.controller";
import { PayrollService } from "./payroll.service";

@Module({
  imports: [FinanceModule, NotificationsModule],
  controllers: [PayrollController],
  providers: [PayrollService],
  exports: [PayrollService],
})
export class PayrollModule {}
