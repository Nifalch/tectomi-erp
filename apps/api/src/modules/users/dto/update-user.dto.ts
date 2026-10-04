import { IsArray, IsEmail, IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { RoleCode, UserStatus } from "@prisma/client";

export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsString()
  avatarUrl?: string;
}

export class SetUserRolesDto {
  @IsArray()
  @IsEnum(RoleCode, { each: true })
  roles!: RoleCode[];
}

export class ResetUserPasswordDto {
  @IsString()
  @MinLength(8)
  newPassword!: string;
}
