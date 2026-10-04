import { IsBoolean, IsDateString, IsInt, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";

export class ClockDto {
  @IsOptional()
  @IsDateString()
  timestamp?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;
}

export class OfficeSettingsDto {
  @IsOptional()
  @IsString()
  name?: string;

  // lat/lng are optional so admins can flip the geofence flag without
  // having to re-pin the office coordinates (the toggle from the
  // attendance help modal sends just `geofenceEnabled`). The service
  // keeps the existing values when these are omitted.
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsInt()
  @Min(10)
  radiusMeters?: number;

  @IsOptional()
  @IsBoolean()
  geofenceEnabled?: boolean;

  // Comma/space/newline-separated list of trusted office IPs or CIDR
  // blocks (IPv4 and IPv6 both supported). When a clock-in request
  // comes from one of these IPs the geofence check passes even without
  // GPS — required for laptops on office WiFi that can't deliver a
  // reliable GPS fix. Empty/null disables the IP fallback.
  @IsOptional()
  @IsString()
  allowedIpAddresses?: string | null;
}

export class AttendancePolicyDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  officeStartHour?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(59)
  officeStartMinute?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  officeEndHour?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(59)
  officeEndMinute?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  graceMinutes?: number;

  // Decimal hours per day — 7.5 or 8 are common. Cast to number so the
  // validation pipe accepts both numeric input and stringified decimals
  // coming from JSON.
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.5)
  @Max(24)
  requiredDailyHours?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  halfDayCutoffHour?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(59)
  halfDayCutoffMinute?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  lateStreakThreshold?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(31)
  monthlyPaidLeaveCap?: number;

  // Bitmask 0..127 (bit 0=Sun ... bit 6=Sat). 126 = Mon-Sat (default).
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(127)
  workingDaysMask?: number;
}
