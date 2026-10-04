import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { CurrentUser } from "../../../common/decorators/current-user.decorator";
import { Roles } from "../../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../../common/guards/roles.guard";
import { HrPermissionsService } from "../permissions/hr-permissions.service";
import type { ViewerContext } from "../permissions/hr-permissions.types";
import { CreateCareerEventDto } from "./dto/create-career-event.dto";
import { CreateHrNoteDto } from "./dto/create-hr-note.dto";
import { TerminateEmployeeDto } from "./dto/terminate-employee.dto";
import { EmployeeProfileService } from "./employee-profile.service";

interface ReqUser {
  id: string;
  roles: RoleCode[];
}

export function viewerFromRequest(user: ReqUser): ViewerContext {
  return { id: user.id, roles: user.roles ?? [] };
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("hr/employees")
export class EmployeeProfileController {
  constructor(
    private readonly service: EmployeeProfileService,
    private readonly perms: HrPermissionsService,
  ) {}

  // Directory listing is sensitive (email, department, designation for
  // everyone). Restricted to roles that legitimately need a cross-org view.
  // Without this, RolesGuard would let any authenticated employee enumerate.
  @Roles(
    RoleCode.SUPER_ADMIN,
    RoleCode.ADMIN,
    RoleCode.HR_MANAGER,
    RoleCode.PROJECT_MANAGER,
    RoleCode.FINANCE_MANAGER,
  )
  @Get()
  listDirectory(
    @Query("search") search?: string,
    @Query("department") department?: string,
    @Query("employmentType") employmentType?: string,
    @Query("managerId") managerId?: string,
    @Query("active") active?: "true" | "false",
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.service.listDirectory({
      search,
      department,
      employmentType,
      managerId,
      active,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(":userId")
  getOverview(@Param("userId") userId: string, @CurrentUser() user: { id: string; roles: RoleCode[] }) {
    return this.service.getOverview(viewerFromRequest(user), userId);
  }

  @Get(":userId/attendance")
  getAttendance(@Param("userId") userId: string, @CurrentUser() user: { id: string; roles: RoleCode[] }) {
    return this.service.getAttendance(viewerFromRequest(user), userId);
  }

  @Get(":userId/leave")
  getLeave(@Param("userId") userId: string, @CurrentUser() user: { id: string; roles: RoleCode[] }) {
    return this.service.getLeave(viewerFromRequest(user), userId);
  }

  @Get(":userId/performance")
  getPerformance(@Param("userId") userId: string, @CurrentUser() user: { id: string; roles: RoleCode[] }) {
    return this.service.getPerformance(viewerFromRequest(user), userId);
  }

  @Get(":userId/payroll")
  getPayroll(@Param("userId") userId: string, @CurrentUser() user: { id: string; roles: RoleCode[] }) {
    return this.service.getPayroll(viewerFromRequest(user), userId);
  }

  @Get(":userId/career")
  getCareer(@Param("userId") userId: string, @CurrentUser() user: { id: string; roles: RoleCode[] }) {
    return this.service.getCareer(viewerFromRequest(user), userId);
  }

  @Get(":userId/projects")
  getProjects(@Param("userId") userId: string, @CurrentUser() user: { id: string; roles: RoleCode[] }) {
    return this.service.getProjects(viewerFromRequest(user), userId);
  }

  @Get(":userId/documents")
  getDocuments(@Param("userId") userId: string, @CurrentUser() user: { id: string; roles: RoleCode[] }) {
    return this.service.getDocuments(viewerFromRequest(user), userId);
  }

  @Get(":userId/assets")
  getAssets(@Param("userId") userId: string, @CurrentUser() user: { id: string; roles: RoleCode[] }) {
    return this.service.getAssets(viewerFromRequest(user), userId);
  }

  @Get(":userId/onboarding")
  getOnboarding(@Param("userId") userId: string, @CurrentUser() user: { id: string; roles: RoleCode[] }) {
    return this.service.getOnboarding(viewerFromRequest(user), userId);
  }

  @Get(":userId/timeline")
  getTimeline(@Param("userId") userId: string, @CurrentUser() user: { id: string; roles: RoleCode[] }) {
    return this.service.getTimeline(viewerFromRequest(user), userId);
  }

  @Get(":userId/notes")
  getNotes(@Param("userId") userId: string, @CurrentUser() user: { id: string; roles: RoleCode[] }) {
    return this.service.getNotes(viewerFromRequest(user), userId);
  }

  @Post(":userId/notes")
  addNote(
    @Param("userId") userId: string,
    @Body() dto: CreateHrNoteDto,
    @CurrentUser() user: { id: string; roles: RoleCode[] },
  ) {
    return this.service.addNote(viewerFromRequest(user), userId, dto);
  }

  @Delete(":userId/notes/:noteId")
  deleteNote(
    @Param("userId") userId: string,
    @Param("noteId") noteId: string,
    @CurrentUser() user: { id: string; roles: RoleCode[] },
  ) {
    return this.service.deleteNote(viewerFromRequest(user), userId, noteId);
  }

  @Post(":userId/career-events")
  addCareerEvent(
    @Param("userId") userId: string,
    @Body() dto: CreateCareerEventDto,
    @CurrentUser() user: { id: string; roles: RoleCode[] },
  ) {
    return this.service.addCareerEvent(viewerFromRequest(user), userId, dto);
  }

  @Post(":userId/resend-invite")
  resendInvite(@Param("userId") userId: string, @CurrentUser() user: { id: string; roles: RoleCode[] }) {
    return this.service.resendInvite(viewerFromRequest(user), userId);
  }

  @Post(":userId/terminate")
  terminate(
    @Param("userId") userId: string,
    @Body() dto: TerminateEmployeeDto,
    @CurrentUser() user: { id: string; roles: RoleCode[] },
  ) {
    return this.service.terminate(viewerFromRequest(user), userId, dto);
  }

  // Reverse a termination. Same authorization as terminate (HR/SUPER_ADMIN).
  @Post(":userId/reactivate")
  reactivate(
    @Param("userId") userId: string,
    @Body() dto: { reason?: string } = {},
    @CurrentUser() user: { id: string; roles: RoleCode[] },
  ) {
    return this.service.reactivate(viewerFromRequest(user), userId, dto.reason);
  }
}
