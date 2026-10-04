import { Type } from "class-transformer";
import { IsEnum, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";
import { FeedbackRelationship } from "@prisma/client";
import { PaginationDto } from "../../../common/pagination/pagination.dto";

export class ListReviewsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  cycleId?: string;

  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  reviewerId?: string;
}

export class SelfReviewDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10)
  selfRating!: number;

  @IsString()
  selfComments!: string;

  @IsOptional()
  @IsString()
  strengths?: string;

  @IsOptional()
  @IsString()
  improvementAreas?: string;
}

export class ManagerReviewDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10)
  managerRating!: number;

  @IsString()
  managerComments!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10)
  finalRating!: number;

  @IsOptional()
  @IsString()
  goalsForNext?: string;
}

export class Feedback360Dto {
  @IsEnum(FeedbackRelationship)
  relationship!: FeedbackRelationship;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10)
  rating!: number;

  @IsOptional()
  @IsString()
  strengths?: string;

  @IsOptional()
  @IsString()
  improvements?: string;

  @IsOptional()
  @IsString()
  comments?: string;
}
