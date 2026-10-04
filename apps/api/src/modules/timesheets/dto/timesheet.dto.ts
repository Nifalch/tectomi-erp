import { IsDateString, IsEnum, IsOptional, IsString } from "class-validator";
import { TimesheetStatus } from "@prisma/client";
import { PaginationDto } from "../../../common/pagination/pagination.dto";

export class ListTimesheetsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsEnum(TimesheetStatus)
  status?: TimesheetStatus;

  // from/to inherited from PaginationDto. Re-declaring them caused a
  // "property will overwrite the base" TS error since the validation
  // decorators are already applied on the parent.
}

export class CreateTimesheetDto {
  @IsDateString()
  weekStart!: string;
}

export class RejectTimesheetDto {
  @IsString()
  comments!: string;
}
