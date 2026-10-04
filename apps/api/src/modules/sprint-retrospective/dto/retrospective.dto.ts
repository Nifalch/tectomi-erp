import { IsOptional, IsString } from "class-validator";

export class UpsertRetrospectiveDto {
  @IsOptional()
  @IsString()
  wentWell?: string | null;

  @IsOptional()
  @IsString()
  toImprove?: string | null;

  @IsOptional()
  @IsString()
  actionItems?: string | null;
}
