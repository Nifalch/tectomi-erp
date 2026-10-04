import { Type } from "class-transformer";
import { IsArray, IsDateString, IsNumber, IsOptional, IsString, ValidateNested } from "class-validator";

export class CreditNoteLineDto {
  @IsOptional() @IsString() itemId?: string;
  @IsString() description!: string;
  @Type(() => Number) @IsNumber() quantity!: number;
  @Type(() => Number) @IsNumber() price!: number;
  @IsOptional() @IsString() taxRateId?: string;
}

export class CreateCreditNoteDto {
  @IsString() clientId!: string;
  @IsOptional() @IsString() invoiceId?: string;
  @IsDateString() issueDate!: string;
  @IsOptional() @IsString() reason?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreditNoteLineDto)
  items!: CreditNoteLineDto[];
}

export class UpdateCreditNoteDto {
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() invoiceId?: string;
  @IsOptional() @IsDateString() issueDate?: string;
  @IsOptional() @IsString() reason?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreditNoteLineDto)
  items?: CreditNoteLineDto[];
}

export class ApplyCreditNoteDto {
  @IsString() invoiceId!: string;
  @Type(() => Number) @IsNumber() amount!: number;
}
