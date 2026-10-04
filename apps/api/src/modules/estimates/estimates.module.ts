import { Module } from "@nestjs/common";
import { EstimatesController } from "./estimates.controller";
import { EstimatesService } from "./estimates.service";

@Module({
  controllers: [EstimatesController],
  providers: [EstimatesService],
})
export class EstimatesModule {}
