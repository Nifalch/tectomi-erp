import { Type } from "class-transformer";
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import { EmploymentType, RoleCode } from "@prisma/client";

export class CreateEmployeeDto {
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsString()
  @IsNotEmpty()
  department!: string;

  @IsString()
  @IsNotEmpty()
  designation!: string;

  @IsEnum(EmploymentType)
  employmentType!: EmploymentType;

  @IsDateString()
  joinDate!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  salary!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  hourlyRate?: number;

  @IsOptional()
  @IsString()
  managerId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsEnum(RoleCode, { each: true })
  roles!: RoleCode[];

  @IsOptional()
  @IsBoolean()
  sendOnboardingChecklist?: boolean;

  @IsOptional()
  @IsString()
  onboardingChecklistId?: string;
}
