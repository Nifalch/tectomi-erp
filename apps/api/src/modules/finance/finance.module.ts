import { Module } from "@nestjs/common";
import { AutoPostService } from "./auto-post.service";
import { FinanceController } from "./finance.controller";
import { FinanceService } from "./finance.service";

@Module({
  controllers: [FinanceController],
  providers: [FinanceService, AutoPostService],
  // Exported so payment/payroll/founder modules can inject AutoPostService
  // and auto-write GL entries on their write paths.
  exports: [AutoPostService],
})
export class FinanceModule {}
