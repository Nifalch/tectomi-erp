import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateChannelDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
