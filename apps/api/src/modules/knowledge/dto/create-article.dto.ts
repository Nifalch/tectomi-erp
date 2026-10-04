import { IsBoolean, IsOptional, IsString } from "class-validator";

export class CreateArticleDto {
  @IsString()
  title!: string;

  @IsString()
  content!: string;

  @IsString()
  category!: string;

  @IsOptional()
  @IsBoolean()
  published?: boolean;
}
