import { CredentialAccessRole, CredentialType } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from "class-validator";

/**
 * Structured secret payload — what actually gets encrypted into `ciphertext`.
 * All fields are optional and not all types use all fields; the controller
 * just JSON-stringifies whatever the caller sends. Keep this aligned with
 * the front-end form fields per type.
 */
export class CredentialSecretDto {
  @IsOptional() @IsString() password?: string;
  @IsOptional() @IsString() apiKey?: string;
  @IsOptional() @IsString() apiSecret?: string;
  @IsOptional() @IsString() privateKey?: string;
  @IsOptional() @IsString() publicKey?: string;
  @IsOptional() @IsString() certificate?: string;
  @IsOptional() @IsString() connectionString?: string;
  @IsOptional() @IsString() host?: string;
  @IsOptional() @IsString() port?: string;
  @IsOptional() @IsString() database?: string;
  @IsOptional() @IsString() envContent?: string;
  @IsOptional() @IsString() cardNumber?: string;
  @IsOptional() @IsString() cardHolder?: string;
  @IsOptional() @IsString() cardExpiry?: string;
  @IsOptional() @IsString() cardCvv?: string;
  @IsOptional() @IsString() pin?: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsString() value?: string;
  // Email + social media specific fields. All encrypted along with the rest
  // of the payload; recovery details get the same treatment as the primary
  // secret because they're effectively a back-door into the account.
  @IsOptional() @IsString() emailAddress?: string;
  @IsOptional() @IsString() recoveryEmail?: string;
  @IsOptional() @IsString() recoveryPhone?: string;
  @IsOptional() @IsString() appPassword?: string;
  // Backup codes pasted as one long string (newline-separated). Stored as a
  // single field so the user can paste exactly what the platform shows.
  @IsOptional() @IsString() twoFactorBackup?: string;
  // Display handle (@nuro7) for social platforms. Lives in the secret blob
  // so a leaked listing doesn't tell an attacker which accounts you operate.
  @IsOptional() @IsString() handle?: string;
}

export class CreateCredentialDto {
  @IsString() @Length(1, 200) name!: string;
  @IsEnum(CredentialType) type!: CredentialType;
  @IsOptional() @IsString() @Length(0, 1000) description?: string;
  @IsOptional() @IsString() @Length(0, 200) username?: string;
  @IsOptional() @IsString() @Length(0, 500) url?: string;
  @ValidateNested() @Type(() => CredentialSecretDto) secret!: CredentialSecretDto;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsString() folderId?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @IsInt() @Min(1) rotationIntervalDays?: number;
  // Force a justification on every reveal — recommended for SOCIAL_MEDIA
  // and EMAIL_ACCOUNT. The reason is captured in the audit metadata.
  @IsOptional() @IsBoolean() requiresReason?: boolean;
  // Visual + behavioral "high-stakes" flag — tightens the client-side
  // relock and marks the row in lists.
  @IsOptional() @IsBoolean() highSecurity?: boolean;
}

export class UpdateCredentialDto {
  @IsOptional() @IsString() @Length(1, 200) name?: string;
  @IsOptional() @IsEnum(CredentialType) type?: CredentialType;
  @IsOptional() @IsString() @Length(0, 1000) description?: string;
  @IsOptional() @IsString() @Length(0, 200) username?: string;
  @IsOptional() @IsString() @Length(0, 500) url?: string;
  @IsOptional() @ValidateNested() @Type(() => CredentialSecretDto) secret?: CredentialSecretDto;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsString() folderId?: string | null;
  @IsOptional() @IsDateString() expiresAt?: string | null;
  @IsOptional() @IsInt() @Min(1) rotationIntervalDays?: number | null;
  // When true, mark `lastRotatedAt = now()` — used when the caller is
  // explicitly performing a rotation (e.g. "I changed the password").
  @IsOptional() @IsBoolean() markRotated?: boolean;
  @IsOptional() @IsBoolean() requiresReason?: boolean;
  @IsOptional() @IsBoolean() highSecurity?: boolean;
}

export class RevealCredentialDto {
  // Free-form reason saved to the audit row. Required when the credential's
  // `requiresReason` flag is on — the service rejects empty strings in that
  // case. Length-capped to keep audit rows reasonable.
  @IsOptional() @IsString() @Length(0, 500) reason?: string;
}

export class ListCredentialsQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(CredentialType) type?: CredentialType;
  @IsOptional() @IsString() folderId?: string;
  @IsOptional() @IsString() tag?: string;
  @IsOptional() @IsString() ownedBy?: "me" | "shared" | "all";
}

export class ShareCredentialDto {
  @IsString() userId!: string;
  @IsEnum(CredentialAccessRole) role!: CredentialAccessRole;
}

export class UpdateShareRoleDto {
  @IsEnum(CredentialAccessRole) role!: CredentialAccessRole;
}

export class CreateFolderDto {
  @IsString() @Length(1, 100) name!: string;
  @IsOptional() @IsString() @Length(0, 500) description?: string;
  @IsOptional() @IsString() parentId?: string;
  @IsOptional() @IsString() color?: string;
}

export class UpdateFolderDto {
  @IsOptional() @IsString() @Length(1, 100) name?: string;
  @IsOptional() @IsString() @Length(0, 500) description?: string;
  @IsOptional() @IsString() parentId?: string | null;
  @IsOptional() @IsString() color?: string | null;
}
