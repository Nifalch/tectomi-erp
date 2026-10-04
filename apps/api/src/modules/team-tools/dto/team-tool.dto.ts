import { TeamToolCategory } from "@prisma/client";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  IsUrl,
} from "class-validator";

export class CreateTeamToolDto {
  @IsString() @Length(1, 100) name!: string;
  @IsOptional() @IsString() @Length(0, 1000) description?: string;
  @IsString() @IsUrl({ require_protocol: true }) url!: string;
  @IsOptional() @IsString() iconUrl?: string;
  @IsOptional() @IsEnum(TeamToolCategory) category?: TeamToolCategory;
  @IsOptional() @IsBoolean() isPinned?: boolean;
  @IsOptional() @IsBoolean() isAi?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}

export class UpdateTeamToolDto {
  @IsOptional() @IsString() @Length(1, 100) name?: string;
  @IsOptional() @IsString() @Length(0, 1000) description?: string;
  @IsOptional() @IsString() @IsUrl({ require_protocol: true }) url?: string;
  @IsOptional() @IsString() iconUrl?: string | null;
  @IsOptional() @IsEnum(TeamToolCategory) category?: TeamToolCategory;
  @IsOptional() @IsBoolean() isPinned?: boolean;
  @IsOptional() @IsBoolean() isAi?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}

export class ListTeamToolsQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(TeamToolCategory) category?: TeamToolCategory;
  @IsOptional() @IsBoolean() isAi?: boolean;
  @IsOptional() @IsBoolean() isPinned?: boolean;
}
