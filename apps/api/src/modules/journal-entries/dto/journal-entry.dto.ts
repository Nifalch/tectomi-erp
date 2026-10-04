import { Type } from "class-transformer";
import { IsArray, IsDateString, IsNumber, IsOptional, IsString, ValidateNested } from "class-validator";

export class JournalLineDto {
  @IsString() accountId!: string;
  @Type(() => Number) @IsNumber() debit!: number;
  @Type(() => Number) @IsNumber() credit!: number;
  @IsOptional() @IsString() description?: string;
}

export class CreateJournalEntryDto {
  @IsDateString() date!: string;
  @IsString() description!: string;
  @IsOptional() @IsString() reference?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines!: JournalLineDto[];
}

export class UpdateJournalEntryDto {
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines?: JournalLineDto[];
}
