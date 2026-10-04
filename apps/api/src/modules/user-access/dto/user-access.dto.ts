import { AccessOverride } from "@prisma/client";
import { IsEnum, IsOptional, IsString, Length } from "class-validator";

export class SetUserAccessDto {
  @IsString() @Length(1, 50) moduleKey!: string;
  @IsEnum(AccessOverride) override!: AccessOverride;
  @IsOptional() @IsString() @Length(0, 500) note?: string;
}
