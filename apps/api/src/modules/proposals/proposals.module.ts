import { Module } from "@nestjs/common";
import { PdfService } from "../../common/pdf/pdf.service";
import { ProposalsController } from "./proposals.controller";
import { ProposalsService } from "./proposals.service";

@Module({
  controllers: [ProposalsController],
  providers: [ProposalsService, PdfService],
})
export class ProposalsModule {}
