import { Type } from "class-transformer";
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString } from "class-validator";
import { AssetStatus } from "@prisma/client";
import { PaginationDto } from "../../../common/pagination/pagination.dto";

export class ListAssetsDto extends PaginationDto {
  @IsOptional()
  @IsEnum(AssetStatus)
  status?: AssetStatus;

  @IsOptional()
  @IsString()
  assignedToId?: string;

  @IsOptional()
  @IsString()
  category?: string;
}

export class CreateAssetDto {
  @IsString()
  name!: string;

  @IsString()
  category!: string;

  @IsOptional()
  @IsString()
  serialNumber?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  manufacturer?: string;

  @IsOptional()
  @IsDateString()
  purchaseDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  purchasePrice?: number;

  @IsOptional()
  @IsEnum(AssetStatus)
  status?: AssetStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateAssetDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  serialNumber?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  manufacturer?: string;

  @IsOptional()
  @IsDateString()
  purchaseDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  purchasePrice?: number;

  @IsOptional()
  @IsEnum(AssetStatus)
  status?: AssetStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class AssignAssetDto {
  @IsString()
  userId!: string;
}
