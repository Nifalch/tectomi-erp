import { Type } from "class-transformer";
import { IsDateString, IsNumber, IsOptional, IsString } from "class-validator";

export class UpsertSalaryStructureDto {
  @IsString()
  employeeId!: string;

  @Type(() => Number)
  @IsNumber()
  basic!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  hra?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  conveyance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  medical?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  specialAllowance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  otherAllowance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  pfDeduction?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  taxDeduction?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  otherDeductions?: number;

  @IsDateString()
  effectiveFrom!: string;
}

export class UpdateSalaryStructureDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  basic?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  hra?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  conveyance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  medical?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  specialAllowance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  otherAllowance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  pfDeduction?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  taxDeduction?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  otherDeductions?: number;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
}
