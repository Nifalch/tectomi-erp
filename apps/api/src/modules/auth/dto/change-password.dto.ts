import { IsString, Length, MinLength } from "class-validator";

export class ChangePasswordDto {
  @IsString() @Length(1, 200) currentPassword!: string;
  @IsString() @MinLength(8) newPassword!: string;
}
