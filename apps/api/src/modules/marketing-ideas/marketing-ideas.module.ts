import { Module } from "@nestjs/common";
import { MarketingIdeasController } from "./marketing-ideas.controller";
import { MarketingIdeasService } from "./marketing-ideas.service";

@Module({
  controllers: [MarketingIdeasController],
  providers: [MarketingIdeasService],
})
export class MarketingIdeasModule {}
