import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateRequestDto {
  @IsString() @MinLength(3) @MaxLength(200)
  title!: string;

  @IsString() @MinLength(1) @MaxLength(10_000)
  body!: string;

  @IsOptional() @IsString()
  projectId?: string;
}

export class ReplyDto {
  @IsString() @MinLength(1) @MaxLength(10_000)
  body!: string;
}

export class ListQueryDto {
  @IsOptional()
  @IsEnum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"])
  status?: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
}
