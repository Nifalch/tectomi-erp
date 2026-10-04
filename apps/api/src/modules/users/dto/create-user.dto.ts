import { IsArray, IsEmail, IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { EmploymentType, RoleCode } from "@prisma/client";

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  designation?: string;

  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @IsArray()
  @IsEnum(RoleCode, { each: true })
  roles!: RoleCode[];
}

