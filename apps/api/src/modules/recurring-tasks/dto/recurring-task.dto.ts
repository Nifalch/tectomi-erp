import { Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
} from "class-validator";
import { Frequency, Priority } from "@prisma/client";

export class CreateRecurringTaskDto {
  @IsString() projectId!: string;
  @IsString() title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  @IsOptional() @IsString() assignedToId?: string;
  @IsOptional() @Type(() => Number) @IsInt() storyPoints?: number;
  @IsOptional() @Type(() => Number) @IsNumber() estimatedHrs?: number;
  @IsOptional() @IsBoolean() sprintAssign?: boolean;
  @IsEnum(Frequency) frequency!: Frequency;
  @IsOptional() @Type(() => Number) @IsInt() dayOfWeek?: number;
  @IsOptional() @Type(() => Number) @IsInt() dayOfMonth?: number;
  @IsDateString() startDate!: string;
  @IsOptional() @IsDateString() endDate?: string;
}

export class UpdateRecurringTaskDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  @IsOptional() @IsString() assignedToId?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() storyPoints?: number;
  @IsOptional() @Type(() => Number) @IsNumber() estimatedHrs?: number;
  @IsOptional() @IsBoolean() sprintAssign?: boolean;
  @IsOptional() @IsEnum(Frequency) frequency?: Frequency;
  @IsOptional() @Type(() => Number) @IsInt() dayOfWeek?: number;
  @IsOptional() @Type(() => Number) @IsInt() dayOfMonth?: number;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string | null;
}
