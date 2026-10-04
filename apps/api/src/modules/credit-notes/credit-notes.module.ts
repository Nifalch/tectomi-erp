import { Module } from "@nestjs/common";
import { FinanceModule } from "../finance/finance.module";
import { CreditNotesController } from "./credit-notes.controller";
import { CreditNotesService } from "./credit-notes.service";

@Module({
  imports: [FinanceModule],
  controllers: [CreditNotesController],
  providers: [CreditNotesService],
})
export class CreditNotesModule {}
