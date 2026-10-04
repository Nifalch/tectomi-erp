import { IsBooleanString, IsOptional } from "class-validator";
import { PaginationDto } from "../../../common/pagination/pagination.dto";

/**
 * Query DTO for GET /users. Extends PaginationDto with admin-only flags.
 *
 * `includeInactive` opts the response into the full directory (terminated
 * and suspended accounts). Defaults to false at the service layer so the
 * many pickers using useUsers() naturally hide deactivated employees.
 *
 * Defined as its own DTO because the global ValidationPipe runs with
 * `forbidNonWhitelisted: true`, which 400s any extra query property —
 * we can't just sneak it past PaginationDto.
 */
export class FindUsersDto extends PaginationDto {
  @IsOptional()
  @IsBooleanString()
  includeInactive?: string;

  // Admin-opt-in flag for views that manage client-portal accounts
  // (e.g. CRM contact admin). Defaults to false at the service layer so
  // staff pickers (project members, task assignees, founder picker,
  // chat invites, etc.) don't surface client portal users — they aren't
  // employees and shouldn't be assignable to internal work.
  @IsOptional()
  @IsBooleanString()
  includeClients?: string;
}
