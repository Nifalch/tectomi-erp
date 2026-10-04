import { Type } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import {
  EquityGrantStatus,
  EquityGrantType,
  FounderLedgerDirection,
  FounderLedgerKind,
} from "@prisma/client";

export class CreateLedgerEntryDto {
  @IsDateString()
  date!: string;

  @IsEnum(FounderLedgerDirection)
  direction!: FounderLedgerDirection;

  @IsEnum(FounderLedgerKind)
  kind!: FounderLedgerKind;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  reference?: string;
}

export class CreateEquityGrantDto {
  // Internal grant target: pass employeeId (an EmployeeProfile id or
  // userId — the service resolves either). External grants (investors,
  // outside advisors) leave employeeId blank and fill holderName/Email/
  // organization instead. The service enforces "one of the two must be
  // present".
  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  holderName?: string;

  @IsOptional()
  @IsString()
  holderEmail?: string;

  @IsOptional()
  @IsString()
  organization?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  investmentAmount?: number;

  @IsOptional()
  @IsDateString()
  investmentDate?: string;

  @IsOptional()
  @IsEnum(EquityGrantType)
  type?: EquityGrantType;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  shares!: number;

  @IsDateString()
  grantDate!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  vestingMonths?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cliffMonths?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

// All grant fields are optional so SUPER_ADMIN can fix any subset
// (just status, just notes, or a full re-grant with new vesting terms).
// Tightened to SUPER_ADMIN at the controller because grants drive
// ownership % and editing them retroactively changes the cap table.
export class UpdateEquityGrantDto {
  @IsOptional()
  @IsEnum(EquityGrantType)
  type?: EquityGrantType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  shares?: number;

  @IsOptional()
  @IsDateString()
  grantDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  vestingMonths?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cliffMonths?: number;

  @IsOptional()
  @IsEnum(EquityGrantStatus)
  status?: EquityGrantStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  // External-holder edit fields. Only meaningful on grants whose
  // employeeId is null (investors / outside advisors).
  @IsOptional()
  @IsString()
  holderName?: string;

  @IsOptional()
  @IsString()
  holderEmail?: string;

  @IsOptional()
  @IsString()
  organization?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  investmentAmount?: number;

  @IsOptional()
  @IsDateString()
  investmentDate?: string;
}

export class CreateValuationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  totalShares!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sharePrice!: number;

  @IsDateString()
  asOf!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

// All fields optional so SUPER_ADMIN can correct any subset (e.g. just
// fix a typo in `notes` without restating the dollar figures).
export class UpdateValuationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  totalShares?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sharePrice?: number;

  @IsOptional()
  @IsDateString()
  asOf?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
