import { Transform } from "class-transformer";
import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";
import { DealStage } from "@prisma/client";
import { PaginationDto } from "../../../common/pagination/pagination.dto";

/** GET /deals query DTO — declared explicitly so the strict ValidationPipe
 *  doesn't reject ?stage / ?ownerId / ?clientId. */
export class ListDealsDto extends PaginationDto {
  @IsOptional() @IsEnum(DealStage) stage?: DealStage;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() clientId?: string;
}

export class CreateDealDto {
  @IsString()
  name!: string;

  @IsString()
  clientId!: string;

  @IsOptional()
  @IsString()
  contactId?: string;

  @IsOptional()
  @IsEnum(DealStage)
  stage?: DealStage;

  /** Optional — defaults to 0 server-side if the form left it blank. */
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  probability?: number;

  @IsOptional()
  @IsDateString()
  expectedCloseDate?: string;

  /** Optional — defaults to the user creating the deal if unspecified. */
  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  leadId?: string;
}

export class UpdateDealDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  contactId?: string;

  @IsOptional()
  @IsEnum(DealStage)
  stage?: DealStage;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  probability?: number;

  @IsOptional()
  @IsDateString()
  expectedCloseDate?: string;

  @IsOptional()
  @IsDateString()
  actualCloseDate?: string;

  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  lostReason?: string;

  @IsOptional()
  @IsString()
  source?: string;
}

export class ConvertFromLeadDto {
  @IsString()
  leadId!: string;
}
