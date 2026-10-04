import { Type } from "class-transformer";
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString } from "class-validator";

export enum TaskStatusCategoryDto {
  TODO = "TODO",
  IN_PROGRESS = "IN_PROGRESS",
  DONE = "DONE",
}

export class CreateProjectStatusDto {
  @IsString() projectId!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() isDone?: boolean;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsEnum(TaskStatusCategoryDto) category?: TaskStatusCategoryDto;
}

export class UpdateProjectStatusDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() isDone?: boolean;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsEnum(TaskStatusCategoryDto) category?: TaskStatusCategoryDto;
}
