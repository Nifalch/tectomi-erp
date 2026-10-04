import { Type } from "class-transformer";
import { IsDateString, IsNumber, IsOptional, IsString } from "class-validator";

export class CreateExpenseDto {
  @IsString()
  title!: string;

  @IsString()
  category!: string;

  @Type(() => Number)
  @IsNumber()
  amount!: number;

  @IsDateString()
  spentAt!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateRevenueDto {
  @IsString()
  title!: string;

  @IsString()
  source!: string;

  @Type(() => Number)
  @IsNumber()
  amount!: number;

  @IsDateString()
  receivedAt!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

