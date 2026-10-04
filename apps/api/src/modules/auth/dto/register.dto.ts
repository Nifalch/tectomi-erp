import { IsArray, IsEmail, IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { RoleCode } from "@prisma/client";

export class RegisterDto {
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
  phone?: string;

  @IsArray()
  @IsEnum(RoleCode, { each: true })
  roles!: RoleCode[];
}

