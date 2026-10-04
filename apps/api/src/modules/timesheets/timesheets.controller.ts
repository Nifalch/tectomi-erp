import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import {
  CreateTimesheetDto,
  ListTimesheetsDto,
  RejectTimesheetDto,
} from "./dto/timesheet.dto";
import { TimesheetsService } from "./timesheets.service";

const ALL_ROLES = [
  RoleCode.SUPER_ADMIN,
  RoleCode.ADMIN,
  RoleCode.HR_MANAGER,
  RoleCode.PROJECT_MANAGER,
  RoleCode.FINANCE_MANAGER,
  RoleCode.EMPLOYEE,
];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("timesheets")
export class TimesheetsController {
  constructor(private readonly svc: TimesheetsService) {}

  @Roles(...ALL_ROLES)
  @Get()
  list(
    @CurrentUser() user: { id: string; roles?: RoleCode[] },
    @Query() query: ListTimesheetsDto,
  ) {
    return this.svc.list(user, query);
  }

  // MUST sit above `@Get(":id")` — otherwise the dynamic route swallows
  // `/timesheets/my` and returns 404 (treats "my" as a timesheet ID).
  @Roles(...ALL_ROLES)
  @Get("my")
  listMine(
    @CurrentUser() user: { id: string; roles?: RoleCode[] },
    @Query() query: ListTimesheetsDto,
  ) {
    return this.svc.list(user, { ...query, userId: user.id });
  }

  @Roles(...ALL_ROLES)
  @Get(":id")
  get(
    @Param("id") id: string,
    @CurrentUser() user: { id: string; roles?: RoleCode[] },
  ) {
    return this.svc.get(id, user);
  }

  @Roles(...ALL_ROLES)
  @Post()
  create(
    @CurrentUser() user: { id: string; roles?: RoleCode[] },
    @Body() dto: CreateTimesheetDto,
  ) {
    return this.svc.create(user, dto);
  }

  @Roles(...ALL_ROLES)
  @Post(":id/submit")
  submit(
    @Param("id") id: string,
    @CurrentUser() user: { id: string; roles?: RoleCode[] },
  ) {
    return this.svc.submit(id, user);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER, RoleCode.PROJECT_MANAGER)
  @Post(":id/approve")
  approve(
    @Param("id") id: string,
    @CurrentUser() user: { id: string; roles?: RoleCode[] },
  ) {
    return this.svc.approve(id, user);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER, RoleCode.PROJECT_MANAGER)
  @Post(":id/reject")
  reject(
    @Param("id") id: string,
    @CurrentUser() user: { id: string; roles?: RoleCode[] },
    @Body() dto: RejectTimesheetDto,
  ) {
    return this.svc.reject(id, user, dto);
  }

  @Roles(...ALL_ROLES)
  @Delete(":id")
  remove(
    @Param("id") id: string,
    @CurrentUser() user: { id: string; roles?: RoleCode[] },
  ) {
    return this.svc.remove(id, user);
  }
}
