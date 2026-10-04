import { IsDecimal, IsEmail, IsEnum, IsOptional, IsString, ValidateIf } from "class-validator";
import { LeadStatus } from "@prisma/client";

export class CreateLeadDto {
  @IsString()
  companyName!: string;

  @IsString()
  contactName!: string;

  // Email is optional — phone/walk-in leads often don't have one
  // upfront. When provided it must still be a valid email so typos
  // don't slip into the DB.
  @IsOptional()
  @ValidateIf((_, v) => v !== "" && v != null)
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @IsOptional()
  @IsDecimal()
  estimatedValue?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  assignedToId?: string;
}
