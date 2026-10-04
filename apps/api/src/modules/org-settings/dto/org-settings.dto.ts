import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString } from "class-validator";

export class UpdateOrgSettingsDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() legalName?: string;
  @IsOptional() @IsString() logoUrl?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() addressLine1?: string;
  @IsOptional() @IsString() addressLine2?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() postalCode?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() taxId?: string;
  @IsOptional() @IsString() fiscalYearStart?: string;
  @IsOptional() @IsString() baseCurrency?: string;
  @IsOptional() @IsString() invoicePrefix?: string;
  @IsOptional() @IsString() invoiceTerms?: string;
  @IsOptional() @IsString() invoiceFooter?: string;
  @IsOptional() @IsString() estimatePrefix?: string;
  @IsOptional() @IsString() billPrefix?: string;
  @IsOptional() @IsString() creditNotePrefix?: string;
  @IsOptional() @Type(() => Number) @IsInt() paymentTerms?: number;
  // Bank details for the invoice template
  @IsOptional() @IsString() bankName?: string;
  @IsOptional() @IsString() bankAccountNumber?: string;
  @IsOptional() @IsString() bankAccountHolder?: string;
  @IsOptional() @IsString() bankBranch?: string;
  @IsOptional() @IsString() bankIfsc?: string;
  @IsOptional() @IsString() bankUpi?: string;
  // Optional stamp/seal image URL
  @IsOptional() @IsString() stampUrl?: string;
  // "About us" narrative used in the proposal template
  @IsOptional() @IsString() aboutCompany?: string;
}
