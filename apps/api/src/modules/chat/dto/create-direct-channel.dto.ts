import { IsNotEmpty, IsString } from "class-validator";

export class CreateDirectChannelDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;
}
