import { MarketingIdeaPriority, MarketingIdeaStage } from "@prisma/client";
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from "class-validator";

export class CreateMarketingIdeaDto {
  @IsString() @Length(1, 200) title!: string;
  @IsOptional() @IsString() @Length(0, 2000) description?: string;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsEnum(MarketingIdeaStage) stage?: MarketingIdeaStage;
  @IsOptional() @IsEnum(MarketingIdeaPriority) priority?: MarketingIdeaPriority;
  @IsOptional() @IsDateString() targetDate?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}

export class UpdateMarketingIdeaDto {
  @IsOptional() @IsString() @Length(1, 200) title?: string;
  @IsOptional() @IsString() @Length(0, 2000) description?: string;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsEnum(MarketingIdeaStage) stage?: MarketingIdeaStage;
  @IsOptional() @IsEnum(MarketingIdeaPriority) priority?: MarketingIdeaPriority;
  @IsOptional() @IsDateString() targetDate?: string | null;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}

export class ListMarketingIdeasQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(MarketingIdeaStage) stage?: MarketingIdeaStage;
  @IsOptional() @IsEnum(MarketingIdeaPriority) priority?: MarketingIdeaPriority;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() tag?: string;
}

export class CreateMarketingIdeaTaskDto {
  @IsString() @Length(1, 200) title!: string;
  @IsOptional() @IsString() assignedToId?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateMarketingIdeaTaskDto {
  @IsOptional() @IsString() @Length(1, 200) title?: string;
  @IsOptional() @IsBoolean() completed?: boolean;
  @IsOptional() @IsString() assignedToId?: string | null;
  @IsOptional() @IsDateString() dueDate?: string | null;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}
