import { Module } from "@nestjs/common";
import { ProductIdeasController } from "./product-ideas.controller";
import { ProductIdeasService } from "./product-ideas.service";

@Module({
  controllers: [ProductIdeasController],
  providers: [ProductIdeasService],
})
export class ProductIdeasModule {}
