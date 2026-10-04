import { SocialPlatform, SocialPostStatus } from "@prisma/client";
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Length,
} from "class-validator";

export class CreateSocialPostDto {
  @IsOptional() @IsString() @Length(0, 200) title?: string;
  @IsString() @Length(1, 5000) content!: string;
  @IsEnum(SocialPlatform) platform!: SocialPlatform;
  @IsOptional() @IsEnum(SocialPostStatus) status?: SocialPostStatus;
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) mediaUrls?: string[];
  @IsOptional() @IsString() link?: string;
  @IsOptional() @IsString() marketingIdeaId?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateSocialPostDto {
  @IsOptional() @IsString() @Length(0, 200) title?: string;
  @IsOptional() @IsString() @Length(1, 5000) content?: string;
  @IsOptional() @IsEnum(SocialPlatform) platform?: SocialPlatform;
  @IsOptional() @IsEnum(SocialPostStatus) status?: SocialPostStatus;
  @IsOptional() @IsDateString() scheduledAt?: string | null;
  @IsOptional() @IsDateString() publishedAt?: string | null;
  @IsOptional() @IsArray() @IsString({ each: true }) mediaUrls?: string[];
  @IsOptional() @IsString() link?: string | null;
  @IsOptional() @IsString() marketingIdeaId?: string | null;
  @IsOptional() @IsString() notes?: string | null;
}

export class ListSocialPostsQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(SocialPlatform) platform?: SocialPlatform;
  @IsOptional() @IsEnum(SocialPostStatus) status?: SocialPostStatus;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() marketingIdeaId?: string;
  // ISO date — inclusive. Used by the calendar view to fetch a month window.
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}
