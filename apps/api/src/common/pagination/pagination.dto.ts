import { Type } from "class-transformer";
import { IsInt, IsISO8601, IsOptional, IsString, Max, Min } from "class-validator";

export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  // Cap raised to 1000 to support "show everything in one fetch" UIs
  // (expenses dashboard, full task pickers). Anything under that is
  // still in the safe range for a normal Prisma findMany.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  pageSize = 10;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  // Optional date-range filter — opt-in for endpoints that support it
  // (time entries, etc). Pass ISO 8601 timestamps. ValidationPipe runs in
  // `forbidNonWhitelisted` mode globally, so these have to live on the
  // shared DTO for any controller using PaginationDto to accept them.
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}

export function getPagination(query: PaginationDto) {
  // Force-coerce in case the transform decorator didn't run (e.g. when the
  // controller used an intersection type like `PaginationDto & { userId?: string }`).
  const page = Math.max(1, Number(query.page ?? 1) || 1);
  const pageSize = Math.max(1, Math.min(1000, Number(query.pageSize ?? 10) || 10));

  return {
    skip: (page - 1) * pageSize,
    take: pageSize,
    page,
    pageSize,
  };
}

