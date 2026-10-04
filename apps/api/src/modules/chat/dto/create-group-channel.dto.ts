import { ArrayMinSize, IsArray, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateGroupChannelDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsArray()
  @ArrayMinSize(2)
  @IsString({ each: true })
  memberIds!: string[];

  @IsOptional()
  @IsString()
  description?: string;
}
