import { Type } from "class-transformer";
import { IsArray, IsDateString, IsEnum, IsNumber, IsOptional, IsString, ValidateNested } from "class-validator";
import { Frequency } from "@prisma/client";

export class RecurringLineDto {
  @IsOptional() @IsString() itemId?: string;
  @IsString() description!: string;
  @Type(() => Number) @IsNumber() quantity!: number;
  @Type(() => Number) @IsNumber() price!: number;
  @IsOptional() @IsString() taxRateId?: string;
}

export class CreateRecurringInvoiceDto {
  @IsString() name!: string;
  @IsString() clientId!: string;
  @IsOptional() @IsString() projectId?: string;
  @IsEnum(Frequency) frequency!: Frequency;
  @IsDateString() startDate!: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsString() notes?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecurringLineDto)
  items!: RecurringLineDto[];
}

export class UpdateRecurringInvoiceDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() projectId?: string;
  @IsOptional() @IsEnum(Frequency) frequency?: Frequency;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecurringLineDto)
  items?: RecurringLineDto[];
}
