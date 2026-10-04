import { IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { HrNoteCategory } from "@prisma/client";

export class CreateHrNoteDto {
  @IsString()
  @MinLength(1)
  body!: string;

  @IsOptional()
  @IsEnum(HrNoteCategory)
  category?: HrNoteCategory;
}
