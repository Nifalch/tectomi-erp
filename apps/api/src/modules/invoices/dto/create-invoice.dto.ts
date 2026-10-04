import { Type } from "class-transformer";
import { IsArray, IsDateString, IsEnum, IsNumber, IsOptional, IsString, ValidateNested } from "class-validator";
import { InvoiceStatus } from "@prisma/client";

class InvoiceItemDto {
  @IsOptional()
  @IsString()
  itemId?: string;

  @IsString()
  description!: string;

  /** Free-text duration shown in the PROJECT DURATION column on the printed invoice (e.g. "2-3 days"). */
  @IsOptional()
  @IsString()
  duration?: string;

  @Type(() => Number)
  @IsNumber()
  quantity!: number;

  @Type(() => Number)
  @IsNumber()
  price!: number;

  @IsOptional()
  @IsString()
  taxRateId?: string;

  // Client may send pre-computed values; server still recalculates.
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  taxAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  total?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sortOrder?: number;
}

export class CreateInvoiceDto {
  @IsString()
  clientId!: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @IsDateString()
  dueDate!: string;

  // Totals — any of these may be sent; server recalculates to stay authoritative.
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  amount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  tax?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  total?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  discountAmount?: number;

  // Optional advance/upfront amount due now (e.g. 50% deposit)
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  advanceAmount?: number;

  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  /** Optional italic centered line rendered between the totals and the bulleted NOTES on the printed invoice. */
  @IsOptional()
  @IsString()
  leadNote?: string;

  /** Client-supplied PO / reference number, printed near the invoice number as "Ref: …". */
  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @IsOptional()
  @IsString()
  terms?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items!: InvoiceItemDto[];
}

/**
 * Update an existing DRAFT invoice. Every field is optional; only those
 * present in the payload get changed. Replacing `items` replaces the full
 * line-item set and triggers a totals recompute on the server.
 */
export class UpdateInvoiceDto {
  @IsOptional() @IsString()
  clientId?: string;

  @IsOptional() @IsString()
  projectId?: string;

  @IsOptional() @IsDateString()
  issueDate?: string;

  @IsOptional() @IsDateString()
  dueDate?: string;

  @IsOptional() @Type(() => Number) @IsNumber()
  discountAmount?: number;

  @IsOptional() @Type(() => Number) @IsNumber()
  advanceAmount?: number;

  @IsOptional() @IsString()
  notes?: string;

  @IsOptional() @IsString()
  leadNote?: string;

  @IsOptional() @IsString()
  referenceNumber?: string;

  @IsOptional() @IsString()
  terms?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items?: InvoiceItemDto[];
}
