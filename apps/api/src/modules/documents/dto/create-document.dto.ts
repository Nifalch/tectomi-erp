import { IsEnum, IsOptional, IsString } from "class-validator";
import { DocumentEntityType } from "@prisma/client";

export class CreateDocumentDto {
  @IsString()
  fileName!: string;

  @IsString()
  fileUrl!: string;

  @IsEnum(DocumentEntityType)
  entityType!: DocumentEntityType;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  clientId?: string;
}

