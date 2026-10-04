import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import { ProjectExpenseCategory } from "@prisma/client";

export class CreateProjectExpenseDto {
  @IsString()
  @IsNotEmpty()
  projectId!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsOptional()
  @IsEnum(ProjectExpenseCategory)
  category?: ProjectExpenseCategory;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsDateString()
  incurredAt!: string;

  @IsOptional()
  @IsBoolean()
  recurring?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  recurrenceMonths?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @Transform(({ value }) => (value === "" ? undefined : value))
  @IsString()
  vendorId?: string;
}
