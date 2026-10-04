import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import { ProjectExpenseCategory } from "@prisma/client";

export class UpdateProjectExpenseDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(ProjectExpenseCategory)
  category?: ProjectExpenseCategory;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsDateString()
  incurredAt?: string;

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
