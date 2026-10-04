import { IsString } from "class-validator";

export class RefreshTokenDto {
  @IsString()
  refreshToken!: string;
}

export class LogoutDto {
  @IsString()
  refreshToken!: string;
}
