import { Type } from "class-transformer";
import { IsDateString, IsNumber, IsOptional, IsString } from "class-validator";

export class CreateResourceAllocationDto {
  @IsString()
  userId!: string;

  @IsString()
  projectId!: string;

  @Type(() => Number)
  @IsNumber()
  allocatedHours!: number;

  @IsString()
  roleLabel!: string;

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

