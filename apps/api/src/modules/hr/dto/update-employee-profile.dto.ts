import { Type } from "class-transformer";
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";
import { EmploymentType } from "@prisma/client";

export class UpdateEmployeeProfileDto {
  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  designation?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  salary?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  hourlyRate?: number;

  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  performanceScore?: number;

  // Co-founder marker. Only togglable by SUPER_ADMIN / ADMIN — gates the
  // deferred-compensation editor on payslips and the founder dashboard.
  @IsOptional()
  @IsBoolean()
  isFounder?: boolean;

  // Reporting line. Pass an empty string or null to clear (employee becomes
  // a root in the org chart). Service validates the manager exists.
  @IsOptional()
  @IsString()
  managerId?: string | null;

  // Per-employee shift override (24-h clock). Pass `null` explicitly to
  // clear the override and fall back to the org-wide AttendancePolicy.
  // Minute columns are 0..59 and pair with the Hour field to support
  // half-hour shifts like 09:30.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  shiftStartHour?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(59)
  shiftStartMinute?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  shiftEndHour?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(59)
  shiftEndMinute?: number | null;

  // Per-employee daily-hours override. Pass null to clear (and inherit
  // the org-wide AttendancePolicy default).
  @IsOptional()
  @Type(() => Number)
  @Min(0.5)
  @Max(24)
  requiredDailyHours?: number | null;
}
