import { IsDateString, IsOptional, IsString } from "class-validator";

export class TerminateEmployeeDto {
  @IsDateString()
  effectiveDate!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
