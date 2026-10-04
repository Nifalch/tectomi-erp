import { IsDateString, IsOptional, IsString } from "class-validator";

export class CreateHolidayDto {
  @IsString()
  name!: string;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
