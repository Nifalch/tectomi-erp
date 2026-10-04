import { Type } from "class-transformer";
import { IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";
import { ExpenseCategory, ExpenseFrequency, PaymentMethod } from "@prisma/client";

export class CreateRecurringExpenseDto {
  @IsString() title!: string;
  @IsEnum(ExpenseCategory) category!: ExpenseCategory;
  @IsOptional() @IsString() vendorId?: string;
  @Type(() => Number) @IsNumber() amount!: number;
  @IsEnum(PaymentMethod) method!: PaymentMethod;
  @IsOptional() @IsString() bankAccountId?: string;
  @IsEnum(ExpenseFrequency) frequency!: ExpenseFrequency;
  @Type(() => Number) @IsInt() @Min(1) @Max(31) dayOfMonth!: number;
  @IsDateString() startDate!: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateRecurringExpenseDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsEnum(ExpenseCategory) category?: ExpenseCategory;
  @IsOptional() @IsString() vendorId?: string;
  @IsOptional() @Type(() => Number) @IsNumber() amount?: number;
  @IsOptional() @IsEnum(PaymentMethod) method?: PaymentMethod;
  @IsOptional() @IsString() bankAccountId?: string;
  @IsOptional() @IsEnum(ExpenseFrequency) frequency?: ExpenseFrequency;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(31) dayOfMonth?: number;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() notes?: string;
}
