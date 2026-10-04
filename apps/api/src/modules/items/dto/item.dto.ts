import { Type } from "class-transformer";
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString } from "class-validator";
import { ItemType } from "@prisma/client";

export class CreateItemDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(ItemType)
  type?: ItemType;

  @Type(() => Number)
  @IsNumber()
  sellingPrice!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  purchasePrice?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  incomeAccountId?: string;

  @IsOptional()
  @IsString()
  expenseAccountId?: string;

  @IsOptional()
  @IsString()
  taxRateId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateItemDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(ItemType)
  type?: ItemType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sellingPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  purchasePrice?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  incomeAccountId?: string;

  @IsOptional()
  @IsString()
  expenseAccountId?: string;

  @IsOptional()
  @IsString()
  taxRateId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
