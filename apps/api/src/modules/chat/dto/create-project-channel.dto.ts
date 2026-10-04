import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateProjectChannelDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
