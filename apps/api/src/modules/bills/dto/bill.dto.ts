import { Type } from "class-transformer";
import { IsArray, IsDateString, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";

export class BillLineDto {
  @IsOptional() @IsString() itemId?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsString() description!: string;
  @Type(() => Number) @IsNumber() quantity!: number;
  @Type(() => Number) @IsNumber() price!: number;
  @IsOptional() @IsString() taxRateId?: string;
}

export class CreateBillDto {
  @IsString() vendorId!: string;
  @IsOptional() @IsString() projectId?: string;
  @IsDateString() issueDate!: string;
  @IsDateString() dueDate!: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() terms?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) discountAmount?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BillLineDto)
  items!: BillLineDto[];
}

export class UpdateBillDto {
  @IsOptional() @IsString() vendorId?: string;
  @IsOptional() @IsString() projectId?: string;
  @IsOptional() @IsDateString() issueDate?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() terms?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) discountAmount?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BillLineDto)
  items?: BillLineDto[];
}
