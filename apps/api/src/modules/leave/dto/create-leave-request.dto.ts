import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString } from "class-validator";
import { LeaveStatus, LeaveType } from "@prisma/client";

export class CreateLeaveRequestDto {
  @IsEnum(LeaveType)
  leaveType!: LeaveType;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsString()
  reason?: string;

  // When true, the request consumes 0.5 day rather than the full
  // (startDate..endDate inclusive) span. Only meaningful for a single-day
  // range; the service rejects half-day spans across multiple dates.
  @IsOptional()
  @IsBoolean()
  isHalfDay?: boolean;
}

export class UpdateLeaveStatusDto {
  @IsEnum(LeaveStatus)
  status!: LeaveStatus;
}
