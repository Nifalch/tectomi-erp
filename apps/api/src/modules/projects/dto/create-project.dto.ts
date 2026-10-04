import { Type } from "class-transformer";
import { IsArray, IsDateString, IsEnum, IsNumber, IsOptional, IsString } from "class-validator";
import { ProjectStatus } from "@prisma/client";

export class CreateProjectDto {
  @IsString()
  name!: string;

  @IsString()
  clientId!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @Type(() => Number)
  @IsNumber()
  budget!: number;

  @IsEnum(ProjectStatus)
  status: ProjectStatus = ProjectStatus.PLANNING;

  @IsString()
  managerId!: string;

  @IsOptional()
  @IsArray()
  memberIds?: string[];
}
