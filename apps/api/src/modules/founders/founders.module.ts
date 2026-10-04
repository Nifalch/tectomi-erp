import { Module } from "@nestjs/common";
import { FinanceModule } from "../finance/finance.module";
import { FoundersController } from "./founders.controller";
import { FoundersService } from "./founders.service";

@Module({
  imports: [FinanceModule],
  controllers: [FoundersController],
  providers: [FoundersService],
  exports: [FoundersService],
})
export class FoundersModule {}
