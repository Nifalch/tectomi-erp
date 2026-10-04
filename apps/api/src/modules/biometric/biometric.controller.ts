import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { BiometricService } from "./biometric.service";
import {
  ReprocessLogsDto,
  SetEnrollIdDto,
  UpdateBiometricDeviceDto,
} from "./dto/biometric.dto";

// Admin/HR-only endpoints for managing devices and enroll-ID mappings.
// The /iclock/* push endpoints (consumed by the device itself) live in
// IclockController and are intentionally unauthenticated.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("biometric")
export class BiometricController {
  constructor(private readonly biometric: BiometricService) {}

  // List every device that's ever connected to the API — approved or
  // not. New devices auto-appear here on first contact.
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Get("devices")
  listDevices() {
    return this.biometric.listDevices();
  }

  // Rename a device or approve/quarantine it. Approving a previously
  // unapproved device triggers a one-shot replay of all its quarantined
  // punches against Attendance.
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Patch("devices/:id")
  updateDevice(@Param("id") id: string, @Body() dto: UpdateBiometricDeviceDto) {
    return this.biometric.updateDevice(id, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  @Delete("devices/:id")
  removeDevice(@Param("id") id: string) {
    return this.biometric.removeDevice(id);
  }

  // Force-replay quarantined punches for a single device — useful when
  // mappings were added in bulk and HR wants to see the back-fill
  // happen immediately instead of waiting for the next punch.
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Post("devices/:id/reprocess")
  reprocessDevice(@Param("id") id: string, @Body() _dto: ReprocessLogsDto) {
    return this.biometric.reprocessPending(id);
  }

  // List distinct (device, enroll-id) pairs we've seen punches for but
  // haven't mapped to a user yet. Drives the "map device IDs to
  // employees" screen in the admin UI.
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Get("unmapped-enrollments")
  unmapped() {
    return this.biometric.unmappedEnrollments();
  }

  // Set (or clear, with empty/null) the biometric enroll ID for a user.
  // Setting a new ID also retro-links every quarantined punch with that
  // enroll ID to the user and replays them into Attendance.
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Patch("users/:userId/enroll-id")
  setEnrollId(@Param("userId") userId: string, @Body() dto: SetEnrollIdDto) {
    return this.biometric.setUserEnrollId(userId, dto.enrollId ?? null);
  }

  // Recent raw biometric logs — for the admin "device feed" page.
  // Use ?limit=N (default 100, max 500).
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Get("logs")
  logs(@Query("limit") limit?: string) {
    return this.biometric.listLogs(Number(limit) || 100);
  }
}
