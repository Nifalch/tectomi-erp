import { ProductIdeaStatus } from "@prisma/client";
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from "class-validator";

export class CreateProductIdeaDto {
  @IsString() @Length(1, 200) title!: string;
  @IsOptional() @IsString() @Length(0, 2000) description?: string;
  @IsOptional() @IsString() @Length(0, 1000) rationale?: string;
  @IsOptional() @IsString() @Length(0, 500) successMetric?: string;
  @IsOptional() @IsEnum(ProductIdeaStatus) status?: ProductIdeaStatus;
  @IsOptional() @IsDateString() targetDate?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}

export class UpdateProductIdeaDto {
  @IsOptional() @IsString() @Length(1, 200) title?: string;
  @IsOptional() @IsString() @Length(0, 2000) description?: string;
  @IsOptional() @IsString() @Length(0, 1000) rationale?: string;
  @IsOptional() @IsString() @Length(0, 500) successMetric?: string;
  @IsOptional() @IsEnum(ProductIdeaStatus) status?: ProductIdeaStatus;
  @IsOptional() @IsDateString() targetDate?: string | null;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}

export class ListProductIdeasQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(ProductIdeaStatus) status?: ProductIdeaStatus;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() tag?: string;
}

export class CreateProductIdeaTaskDto {
  @IsString() @Length(1, 200) title!: string;
  @IsOptional() @IsString() assignedToId?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateProductIdeaTaskDto {
  @IsOptional() @IsString() @Length(1, 200) title?: string;
  @IsOptional() @IsBoolean() completed?: boolean;
  @IsOptional() @IsString() assignedToId?: string | null;
  @IsOptional() @IsDateString() dueDate?: string | null;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}
