import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class UpdateBiometricDeviceDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsBoolean()
  approved?: boolean;
}

export class SetEnrollIdDto {
  // Stored as a string to preserve leading zeros (the device shows "007"
  // and "07" as distinct enrollments). Empty string clears the mapping.
  @IsOptional()
  @IsString()
  @MaxLength(32)
  enrollId?: string | null;
}

export class ReprocessLogsDto {
  // Limit to avoid accidentally reprocessing months of backlog in one
  // request. The admin can call again with a larger window if needed.
  @IsOptional()
  @IsString()
  deviceId?: string;
}
