import { IsDateString, IsEnum, IsOptional, IsString } from "class-validator";
import { ReviewType } from "@prisma/client";

export class CreateCycleDto {
  @IsString()
  name!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsEnum(ReviewType)
  reviewType?: ReviewType;
}
