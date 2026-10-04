import { Type } from "class-transformer";
import { IsBoolean, IsNumber, IsOptional, IsString } from "class-validator";

export class CreateTaxRateDto {
  @IsString()
  name!: string;

  @Type(() => Number)
  @IsNumber()
  rate!: number;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsBoolean()
  isCompound?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateTaxRateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  rate?: number;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsBoolean()
  isCompound?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
