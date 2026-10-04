import { Transform } from "class-transformer";
import { IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsObject, IsOptional, IsString, MinLength } from "class-validator";
import { ClientPriority } from "@prisma/client";

/**
 * Transforms "" → undefined BEFORE validation runs, so empty strings from the
 * frontend don't trip `@IsEmail()` / `@IsEnum()` / `@IsUrl()` etc. because
 * `@IsOptional()` only skips validation on null/undefined, not empty strings.
 */
const EmptyToUndefined = () =>
  Transform(({ value }) => (value === "" ? undefined : value));

export class CreateClientDto {
  @IsString()
  @MinLength(1, { message: "Company name is required" })
  companyName!: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsString()
  contactPerson?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsEmail({}, { message: "Email must be a valid email address" })
  email?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsString()
  phone?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsString()
  address?: string;

  // Free-form so users can type "acme.com" without https://.
  @EmptyToUndefined()
  @IsOptional()
  @IsString()
  website?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsString()
  notes?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsString()
  industry?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsString()
  city?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsString()
  country?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsEnum(ClientPriority)
  priority?: ClientPriority;

  @EmptyToUndefined()
  @IsOptional()
  @IsString()
  status?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsString()
  accountManagerId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @EmptyToUndefined()
  @IsOptional()
  @IsDateString()
  nextFollowUpAt?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsString()
  referralSource?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsDateString()
  acquiredAt?: string;

  @IsOptional()
  @IsBoolean()
  portalEnabled?: boolean;

  // Free-form org-defined fields — rendered by the CustomFieldDef schema on the frontend.
  @IsOptional()
  @IsObject()
  customFields?: Record<string, unknown>;
}
