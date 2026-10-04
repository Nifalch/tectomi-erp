import { Type } from "class-transformer";
import { IsArray, IsDateString, IsNumber, IsOptional, IsString, ValidateNested } from "class-validator";

export class EstimateLineDto {
  @IsOptional() @IsString() itemId?: string;
  @IsString() description!: string;
  @Type(() => Number) @IsNumber() quantity!: number;
  @Type(() => Number) @IsNumber() price!: number;
  @IsOptional() @IsString() taxRateId?: string;
}

export class CreateEstimateDto {
  @IsString() clientId!: string;
  @IsOptional() @IsString() projectId?: string;
  @IsDateString() issueDate!: string;
  @IsOptional() @IsDateString() expiryDate?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() terms?: string;
  @IsOptional() @Type(() => Number) @IsNumber() discountAmount?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EstimateLineDto)
  items!: EstimateLineDto[];
}

export class UpdateEstimateDto {
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() projectId?: string;
  @IsOptional() @IsDateString() issueDate?: string;
  @IsOptional() @IsDateString() expiryDate?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() terms?: string;
  @IsOptional() @Type(() => Number) @IsNumber() discountAmount?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EstimateLineDto)
  items?: EstimateLineDto[];
}
