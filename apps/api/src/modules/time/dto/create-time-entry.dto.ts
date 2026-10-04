import { IsDateString, IsInt, IsOptional, IsString, Min } from "class-validator";

export class CreateTimeEntryDto {
  @IsString()
  projectId!: string;

  @IsOptional()
  @IsString()
  taskId?: string;

  @IsDateString()
  startTime!: string;

  @IsOptional()
  @IsDateString()
  endTime?: string;

  // Duration in minutes. The manual "Log Time Entry" dialog only collects
  // start + duration (no end time), so accept it directly. Service computes
  // endTime = startTime + duration when this is set.
  @IsOptional()
  @IsInt()
  @Min(1)
  duration?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

