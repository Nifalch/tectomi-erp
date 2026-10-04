import { Module } from "@nestjs/common";
import { SocialPostsController } from "./social-posts.controller";
import { SocialPostsService } from "./social-posts.service";

@Module({
  controllers: [SocialPostsController],
  providers: [SocialPostsService],
})
export class SocialPostsModule {}
