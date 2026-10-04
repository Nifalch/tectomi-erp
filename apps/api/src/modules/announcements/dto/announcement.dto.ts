import { IsDateString, IsEnum, IsOptional, IsString } from "class-validator";
import { AnnouncementPriority } from "@prisma/client";

export class CreateAnnouncementDto {
  @IsString()
  title!: string;

  @IsString()
  content!: string;

  @IsOptional()
  @IsEnum(AnnouncementPriority)
  priority?: AnnouncementPriority;

  @IsOptional()
  @IsDateString()
  pinnedUntil?: string;
}

export class UpdateAnnouncementDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsEnum(AnnouncementPriority)
  priority?: AnnouncementPriority;

  @IsOptional()
  @IsDateString()
  pinnedUntil?: string;
}
