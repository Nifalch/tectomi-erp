import { Type } from "class-transformer";
import { IsBoolean, IsDateString, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";
import { Priority, TaskStatus } from "@prisma/client";

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  projectId!: string;

  @IsString()
  @IsNotEmpty({ message: "Title is required" })
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  assignedToId?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  sprintId?: string;

  @IsOptional()
  @IsString()
  milestoneId?: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  storyPoints?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  estimatedHrs?: number;

  @IsOptional()
  @IsString()
  customStatusId?: string;
}

/**
 * UpdateTaskDto — all fields optional but enum-validated so invalid values
 * get a 400 instead of leaking through and crashing Prisma with a 500.
 */
export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: "Title cannot be empty" })
  title?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  assignedToId?: string | null;

  @IsOptional()
  @IsEnum(TaskStatus, { message: "Invalid status value" })
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(Priority, { message: "Invalid priority value" })
  priority?: Priority;

  @IsOptional()
  @IsDateString()
  startDate?: string | null;

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @IsOptional()
  @IsString()
  sprintId?: string | null;

  @IsOptional()
  @IsString()
  milestoneId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  storyPoints?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  estimatedHrs?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  progressPercent?: number;

  @IsOptional()
  @IsBoolean()
  force?: boolean;

  @IsOptional()
  @IsBoolean()
  isClientVisible?: boolean;

  @IsOptional()
  @IsString()
  customStatusId?: string | null;
}

export class CreateTaskCommentDto {
  @IsString()
  content!: string;
}

