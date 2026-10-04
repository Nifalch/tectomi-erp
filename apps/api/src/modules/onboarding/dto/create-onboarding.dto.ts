import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsBoolean, IsOptional, IsString, ValidateNested } from "class-validator";

export class OnboardingItemInputDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  assigneeId?: string;
}

export class CreateOnboardingChecklistDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => OnboardingItemInputDto)
  items?: OnboardingItemInputDto[];
}

export class ToggleOnboardingItemDto {
  @IsBoolean()
  completed!: boolean;
}
