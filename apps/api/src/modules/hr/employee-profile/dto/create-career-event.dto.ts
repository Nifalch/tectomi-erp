import { IsDateString, IsEnum, IsOptional, IsString } from "class-validator";
import { EmploymentEventType } from "@prisma/client";

export class CreateCareerEventDto {
  @IsEnum(EmploymentEventType)
  type!: EmploymentEventType;

  @IsOptional()
  @IsString()
  fromValue?: string;

  @IsOptional()
  @IsString()
  toValue?: string;

  @IsDateString()
  effectiveDate!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
