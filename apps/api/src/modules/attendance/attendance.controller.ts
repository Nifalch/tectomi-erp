import { Body, Controller, Get, Ip, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { RoleCode } from "@prisma/client";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { resolveScopedUserId } from "../../common/scope/resolve-scope.util";
import { AttendancePolicyDto, ClockDto, OfficeSettingsDto } from "./dto/attendance.dto";
import { AttendanceService } from "./attendance.service";

const ALL_AUTH_ROLES = [
  RoleCode.SUPER_ADMIN,
  RoleCode.ADMIN,
  RoleCode.HR_MANAGER,
  RoleCode.PROJECT_MANAGER,
  RoleCode.FINANCE_MANAGER,
  RoleCode.EMPLOYEE,
];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("attendance")
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER, RoleCode.EMPLOYEE)
  @Get()
  list(
    @CurrentUser() user: { id: string; roles?: RoleCode[] },
    @Query("userId") userId?: string,
  ) {
    const scopedId = resolveScopedUserId(user, userId);
    return this.attendanceService.list(scopedId);
  }

  // Today's status for the current user — used by the topbar quick-access
  // widget so it can show the right button (Clock In vs Clock Out vs done)
  // and warn about late-streak proximity.
  @Roles(...ALL_AUTH_ROLES)
  @Get("today")
  today(@CurrentUser() user: { id: string }) {
    return this.attendanceService.todayStatus(user.id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Get("team")
  teamOverview() {
    return this.attendanceService.teamOverview();
  }

  // HR-only: per-employee monthly counts (present/late/half-day/absent).
  // Query param `month` accepts YYYY-MM; defaults to current month.
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Get("hr-summary")
  hrSummary(@Query("month") month?: string) {
    return this.attendanceService.hrMonthlySummary(month);
  }

  // ── Office (geofence) settings ──
  @Roles(...ALL_AUTH_ROLES)
  @Get("office-settings")
  getOfficeSettings() {
    return this.attendanceService.getOfficeSettings();
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  @Patch("office-settings")
  updateOfficeSettings(@Body() dto: OfficeSettingsDto) {
    return this.attendanceService.updateOfficeSettings(dto);
  }

  // ── Attendance policy (office hours, grace, late threshold, etc.) ──
  @Roles(...ALL_AUTH_ROLES)
  @Get("policy")
  getPolicy() {
    return this.attendanceService.getPolicy();
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Patch("policy")
  updatePolicy(@Body() dto: AttendancePolicyDto) {
    return this.attendanceService.updatePolicy(dto);
  }

  // ── Clock-in / Clock-out ──
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER, RoleCode.FINANCE_MANAGER, RoleCode.EMPLOYEE)
  @Post("clock-in")
  async clockIn(@CurrentUser() user: { id: string }, @Body() dto: ClockDto, @Req() req: Request) {
    const clientIp = pickClientIp(req);
    const result = await this.attendanceService.clockIn(
      user.id,
      dto.timestamp,
      dto.latitude,
      dto.longitude,
      clientIp,
    );
    // Notify the user out-of-band if an automatic deduction was applied.
    // We intentionally don't await failure — notifications are non-fatal.
    if (result.autoLeave) {
      this.attendanceService
        .sendAutoLeaveNotification(user.id, result.autoLeave)
        .catch(() => undefined);
    }
    return result;
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER, RoleCode.FINANCE_MANAGER, RoleCode.EMPLOYEE)
  @Post("clock-out")
  clockOut(@CurrentUser() user: { id: string }, @Body() dto: ClockDto, @Req() req: Request) {
    return this.attendanceService.clockOut(user.id, dto.timestamp, dto.latitude, dto.longitude, pickClientIp(req));
  }

  /**
   * What's-my-IP endpoint. Used by Office Settings admins to pin "this
   * network" as a trusted office IP, AND by employees as a preflight
   * before clocking in — so when network-based attendance silently
   * fails, anyone on the team can see the IP the API actually sees from
   * their device and report it to HR. Open to every authenticated role.
   */
  @Roles(
    RoleCode.SUPER_ADMIN,
    RoleCode.ADMIN,
    RoleCode.HR_MANAGER,
    RoleCode.PROJECT_MANAGER,
    RoleCode.FINANCE_MANAGER,
    RoleCode.EMPLOYEE,
  )
  @Get("my-ip")
  myIp(@Req() req: Request) {
    const raw = pickClientIp(req);
    const isLoopback = raw === "::1" || raw === "127.0.0.1" || (raw ?? "").startsWith("::ffff:127.");
    return {
      ip: raw,
      isLoopback,
      note: isLoopback
        ? "Loopback address — you're hitting the API from localhost so it can only see itself, not your office's public IP. Open a 'what's my IP' page from this WiFi to find the real public IP for production; for dev testing, 127.0.0.1 / ::1 work as-is."
        : null,
    };
  }

  /**
   * Preflight check — tells the caller whether their current network IP
   * is in the office allowlist, so they can clock in confidently (or
   * report the actual IP if it's not). Returns a self-contained answer
   * without leaking the full allowlist back to non-admin users.
   */
  @Roles(
    RoleCode.SUPER_ADMIN,
    RoleCode.ADMIN,
    RoleCode.HR_MANAGER,
    RoleCode.PROJECT_MANAGER,
    RoleCode.FINANCE_MANAGER,
    RoleCode.EMPLOYEE,
  )
  @Get("check-network")
  async checkNetwork(@Req() req: Request) {
    const clientIp = pickClientIp(req);
    return this.attendanceService.checkOfficeNetwork(clientIp);
  }
}

/**
 * Best-effort client IP. Express's `req.ip` already respects the
 * `trust proxy` setting configured in main.ts, so this returns the real
 * client IP behind the configured number of hops (nginx, Cloudflare, ELB,
 * etc.). We deliberately do NOT read the raw `X-Forwarded-For` header
 * here: an authenticated user could otherwise spoof the office IP by
 * sending their own X-Forwarded-For and bypass the geofence/allowlist.
 */
function pickClientIp(req: Request): string | undefined {
  return req.ip ?? undefined;
}

