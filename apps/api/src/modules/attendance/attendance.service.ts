import { BadRequestException, Injectable } from "@nestjs/common";
import {
  AttendanceStatus,
  LeaveSource,
  LeaveStatus,
  LeaveType,
  NotificationType,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PerformanceReviewsService } from "../performance-reviews/performance-reviews.service";
import { AttendancePolicyDto, OfficeSettingsDto } from "./dto/attendance.dto";
import { isIpAllowed, normalizeClientIp } from "./ip-allowlist.util";

// Defaults that mirror the @default() values on the AttendancePolicy model.
// Used when no policy row exists yet (fresh install, or HR hasn't visited
// the settings UI). Keep these in sync with schema.prisma.
const DEFAULT_POLICY = {
  officeStartHour: 10,
  officeStartMinute: 0,
  officeEndHour: 18,
  officeEndMinute: 0,
  graceMinutes: 10,
  halfDayCutoffHour: 12,
  halfDayCutoffMinute: 0,
  requiredDailyHours: 8,
  lateStreakThreshold: 3,
  monthlyPaidLeaveCap: 2,
  workingDaysMask: 0b1111110, // 126 = Mon-Sat
};

type ResolvedPolicy = typeof DEFAULT_POLICY;

/**
 * Returns the calendar date (00:00 server-local) for the given Date. Using
 * `toISOString().slice(0,10)` would slice in UTC, which silently flips to
 * the previous day for any clock-in past 18:30 IST (IST = UTC+5:30) — every
 * "I clocked in at 11 PM and it showed up on yesterday" bug traces back here.
 */
function localDateOf(d: Date): Date {
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return local;
}

// Hard cap for totalHours when an employee forgets to clock out and the
// next-day clock-out comes in. Without this, the field stores "31.42 hours"
// which makes downstream reporting nonsense. 16h is generous for any single
// shift and triggers HR review when exceeded.
const MAX_REASONABLE_DAY_HOURS = 16;

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    // Auto half-day and late-streak deductions create LeaveRequests; when
    // those are unpaid (monthly cap exhausted) the performance score needs
    // to drop. The performance service owns the rollup formula.
    private readonly performance: PerformanceReviewsService,
  ) {}

  async list(userId: string) {
    return this.prisma.attendance.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take: 60,
    });
  }

  async teamOverview() {
    return this.prisma.attendance.findMany({
      include: { user: true },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 200,
    });
  }

  async getOfficeSettings() {
    const settings = await this.prisma.officeSettings.findFirst();
    if (!settings) {
      return {
        id: null,
        name: "Main Office",
        latitude: 0,
        longitude: 0,
        radiusMeters: 100,
        geofenceEnabled: false,
      };
    }
    return settings;
  }

  async updateOfficeSettings(dto: OfficeSettingsDto) {
    const existing = await this.prisma.officeSettings.findFirst();
    if (existing) {
      // Partial update — only overwrite fields the caller actually
      // provided so admins can flip just `geofenceEnabled` from the
      // attendance help modal without re-pinning coordinates.
      return this.prisma.officeSettings.update({
        where: { id: existing.id },
        data: {
          name: dto.name ?? undefined,
          latitude: dto.latitude ?? undefined,
          longitude: dto.longitude ?? undefined,
          radiusMeters: dto.radiusMeters ?? undefined,
          geofenceEnabled: dto.geofenceEnabled ?? undefined,
          // Explicit null wipes the allowlist; undefined leaves it
          // alone. Empty string also clears it for the convenience of
          // a "clear" button in the UI.
          allowedIpAddresses:
            dto.allowedIpAddresses === null
              ? null
              : typeof dto.allowedIpAddresses === "string"
                ? dto.allowedIpAddresses.trim() || null
                : undefined,
        },
      });
    }
    // First-time create still needs coordinates to be meaningful, but
    // we allow zeroes so a "turn off geofence" call from a fresh DB
    // doesn't 500. Admin can fill in the pin from Office Settings.
    return this.prisma.officeSettings.create({
      data: {
        name: dto.name ?? "Main Office",
        latitude: dto.latitude ?? 0,
        longitude: dto.longitude ?? 0,
        radiusMeters: dto.radiusMeters ?? 100,
        geofenceEnabled: dto.geofenceEnabled ?? false,
        allowedIpAddresses:
          typeof dto.allowedIpAddresses === "string" ? dto.allowedIpAddresses.trim() || null : null,
      },
    });
  }

  // ── Attendance policy (singleton) ──
  async getPolicy(): Promise<ResolvedPolicy> {
    const row = await this.prisma.attendancePolicy.findFirst();
    if (!row) return DEFAULT_POLICY;
    return {
      officeStartHour: row.officeStartHour,
      officeStartMinute: row.officeStartMinute,
      officeEndHour: row.officeEndHour,
      officeEndMinute: row.officeEndMinute,
      graceMinutes: row.graceMinutes,
      halfDayCutoffHour: row.halfDayCutoffHour,
      halfDayCutoffMinute: row.halfDayCutoffMinute,
      requiredDailyHours: Number(row.requiredDailyHours),
      lateStreakThreshold: row.lateStreakThreshold,
      monthlyPaidLeaveCap: row.monthlyPaidLeaveCap,
      workingDaysMask: row.workingDaysMask,
    };
  }

  async updatePolicy(dto: AttendancePolicyDto) {
    const existing = await this.prisma.attendancePolicy.findFirst();
    if (existing) {
      return this.prisma.attendancePolicy.update({
        where: { id: existing.id },
        data: dto,
      });
    }
    return this.prisma.attendancePolicy.create({ data: dto });
  }

  /**
   * Preflight network check. Returns whether the caller's current IP would
   * satisfy the office-network gate, without actually clocking them in.
   * Used by the "Test office network" button so an employee can verify
   * they're set up correctly before they hit Clock In. Never exposes the
   * full allowlist — only echoes back the IP the API saw + a yes/no.
   */
  async checkOfficeNetwork(clientIp?: string) {
    const settings = await this.prisma.officeSettings.findFirst();
    const seenIp = normalizeClientIp(clientIp) ?? null;
    if (!settings || !settings.geofenceEnabled) {
      return {
        seenIp,
        geofenceEnabled: false,
        matchesAllowlist: false,
        message: "Office geofence is currently off. Anyone can clock in from any network.",
      };
    }
    const matches = isIpAllowed(clientIp, settings.allowedIpAddresses);
    const hasAllowlist = !!settings.allowedIpAddresses?.trim();
    return {
      seenIp,
      geofenceEnabled: true,
      hasAllowlist,
      matchesAllowlist: matches,
      message: matches
        ? `Your IP ${seenIp ?? "(unknown)"} matches the office allowlist. You can clock in without GPS.`
        : hasAllowlist
          ? `Your IP ${seenIp ?? "(unknown)"} is NOT in the office allowlist. You'll need GPS or HR needs to add your IP.`
          : "No office allowlist is set yet. Ask HR to configure trusted network IPs.",
    };
  }

  // ── Geofence helpers ──
  private distanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * Decide whether a clock-in/out is allowed given the device's GPS fix
   * (if any) and the request's source IP. Two ways to pass:
   *   1. GPS coordinates are inside the office geofence radius
   *   2. Request IP is in the office's trusted-IP allowlist (covers
   *      laptops on office WiFi when GPS is unavailable, which is the
   *      common Mac-without-GPS case)
   * Geofence-disabled orgs always pass. When neither check matches, we
   * surface the most actionable error — distance if we got coordinates,
   * "location required" if we didn't.
   */
  private async verifyLocation(latitude?: number, longitude?: number, clientIp?: string) {
    const settings = await this.prisma.officeSettings.findFirst();
    if (!settings || !settings.geofenceEnabled) return;

    // Fast-path: trusted office IP. Treated as equivalent to a valid
    // GPS lock — the user is verifiably at the office network.
    if (isIpAllowed(clientIp, settings.allowedIpAddresses)) return;

    if (latitude === undefined || longitude === undefined) {
      // Include the IP the API saw so HR can diagnose mismatches quickly.
      // Don't echo the full allowlist — that's admin-only info — but the
      // observed IP is the same one the employee can see via /my-ip.
      const seenIp = clientIp ? ` (this device appeared as ${clientIp})` : "";
      const hasAllowlist = !!settings.allowedIpAddresses?.trim();
      throw new BadRequestException(
        hasAllowlist
          ? `Location required. Enable location access to clock in, or ask HR to add this network to the office allowlist${seenIp}.`
          : `Location required. Enable location access to clock in, or ask HR to set up the office network allowlist${seenIp}.`,
      );
    }
    const distance = this.distanceInMeters(
      settings.latitude,
      settings.longitude,
      latitude,
      longitude,
    );
    if (distance > settings.radiusMeters) {
      throw new BadRequestException(
        `You are ${Math.round(distance)}m from ${settings.name}. You must be within ${settings.radiusMeters}m to clock in.`,
      );
    }
  }

  /**
   * Per-employee effective shift policy. The org-wide AttendancePolicy
   * provides the defaults; if the employee's profile has a shift
   * override, that wins. The half-day cutoff is preserved as an
   * *offset* from the start hour (e.g. "2 hours after start") so the
   * leniency window stays fair regardless of which shift the employee
   * is on — a 9-start employee gets half-day at 11, not at the org's
   * fixed 12pm.
   */
  private async effectivePolicyFor(userId: string): Promise<ResolvedPolicy> {
    const [policy, profile] = await Promise.all([
      this.getPolicy(),
      this.prisma.employeeProfile.findUnique({
        where: { userId },
        select: {
          shiftStartHour: true,
          shiftStartMinute: true,
          shiftEndHour: true,
          shiftEndMinute: true,
          requiredDailyHours: true,
        },
      }),
    ]);
    if (!profile) return policy;

    // Resolve the daily-hours target — per-employee override wins over the
    // org default. Used to compute the expected end of shift.
    const requiredHours = profile.requiredDailyHours != null
      ? Number(profile.requiredDailyHours)
      : policy.requiredDailyHours;

    if (profile.shiftStartHour == null) {
      return { ...policy, requiredDailyHours: requiredHours };
    }

    // Compute the half-day cutoff as a fixed offset (in minutes) from the
    // policy's office start, so a 10:00 → 12:00 cutoff becomes 09:30 → 11:30
    // when an employee's override starts at 09:30 — the relative penalty
    // window stays the same.
    const policyStartMin = policy.officeStartHour * 60 + policy.officeStartMinute;
    const policyCutoffMin = policy.halfDayCutoffHour * 60 + policy.halfDayCutoffMinute;
    const halfDayOffsetMin = Math.max(0, policyCutoffMin - policyStartMin);

    const effectiveStartH = profile.shiftStartHour;
    const effectiveStartM = profile.shiftStartMinute ?? 0;

    // End-of-shift = start + requiredHours. The explicit shiftEndHour
    // override (if set) still wins, but for the common case where HR only
    // sets the start time we now auto-compute the end from the daily-hours
    // target.
    let effectiveEndH: number;
    let effectiveEndM: number;
    if (profile.shiftEndHour != null) {
      effectiveEndH = profile.shiftEndHour;
      effectiveEndM = profile.shiftEndMinute ?? 0;
    } else {
      const endTotalMin = Math.min(
        23 * 60 + 59,
        Math.round(effectiveStartH * 60 + effectiveStartM + requiredHours * 60),
      );
      effectiveEndH = Math.floor(endTotalMin / 60);
      effectiveEndM = endTotalMin % 60;
    }

    const cutoffTotalMin = Math.min(
      23 * 60 + 59,
      effectiveStartH * 60 + effectiveStartM + halfDayOffsetMin,
    );

    return {
      ...policy,
      officeStartHour: effectiveStartH,
      officeStartMinute: effectiveStartM,
      officeEndHour: effectiveEndH,
      officeEndMinute: effectiveEndM,
      halfDayCutoffHour: Math.floor(cutoffTotalMin / 60),
      halfDayCutoffMinute: cutoffTotalMin % 60,
      requiredDailyHours: requiredHours,
    };
  }

  // ── Status computation ──
  // Returns the AttendanceStatus + late-minutes for a given check-in
  // datetime against the active policy. Used by clockIn().
  private resolveStatus(
    checkIn: Date,
    policy: ResolvedPolicy,
  ): { status: AttendanceStatus; lateMinutes: number } {
    const officeStart = new Date(checkIn);
    officeStart.setHours(policy.officeStartHour, policy.officeStartMinute, 0, 0);

    const graceEnd = new Date(officeStart);
    graceEnd.setMinutes(graceEnd.getMinutes() + policy.graceMinutes);

    const halfDayCutoff = new Date(checkIn);
    halfDayCutoff.setHours(policy.halfDayCutoffHour, policy.halfDayCutoffMinute, 0, 0);

    if (checkIn <= graceEnd) {
      return { status: AttendanceStatus.PRESENT, lateMinutes: 0 };
    }
    const lateMinutes = Math.max(
      0,
      Math.round((checkIn.getTime() - officeStart.getTime()) / 60000),
    );
    if (checkIn >= halfDayCutoff) {
      return { status: AttendanceStatus.HALF_DAY, lateMinutes };
    }
    return { status: AttendanceStatus.LATE, lateMinutes };
  }

  // ── Monthly accounting helpers ──
  private monthRange(d: Date): { start: Date; end: Date } {
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    return { start, end };
  }

  // Sum the days a user has used in the current calendar month across all
  // approved LeaveRequests (regardless of source). Used to decide if a new
  // auto-deduction should be flagged as paid or unpaid.
  private async paidLeavesThisMonth(userId: string, ref: Date): Promise<number> {
    const { start, end } = this.monthRange(ref);
    const rows = await this.prisma.leaveRequest.aggregate({
      where: {
        userId,
        status: LeaveStatus.APPROVED,
        isPaid: true,
        startDate: { gte: start, lt: end },
      },
      _sum: { days: true },
    });
    return rows._sum.days ? Number(rows._sum.days) : 0;
  }

  // Decide whether a new leave deduction of `days` should be PAID. False
  // once the monthly cap is exhausted; partial overshoot still rounds
  // unpaid (we don't split a single auto-deduction into a paid+unpaid pair).
  private async decidePaid(
    userId: string,
    days: number,
    ref: Date,
    policy: ResolvedPolicy,
  ): Promise<boolean> {
    const used = await this.paidLeavesThisMonth(userId, ref);
    return used + days <= policy.monthlyPaidLeaveCap;
  }

  // Idempotently apply a leave-balance deduction for type CASUAL and write
  // the matching LeaveRequest. Returns the created request.
  private async applyLeaveDeduction(
    tx: Prisma.TransactionClient,
    userId: string,
    days: number,
    date: Date,
    source: LeaveSource,
    isPaid: boolean,
    reason: string,
    isHalfDay: boolean,
  ) {
    // Best-effort balance decrement on the CASUAL ledger. updateMany is
    // a no-op if the user has no CASUAL row (e.g. brand-new employee
    // before HR allocates).
    if (isPaid) {
      await tx.leaveBalance.updateMany({
        where: { userId, leaveType: LeaveType.CASUAL },
        data: {
          usedDays: { increment: new Prisma.Decimal(days) },
          remaining: { decrement: new Prisma.Decimal(days) },
        },
      });
    }
    return tx.leaveRequest.create({
      data: {
        userId,
        leaveType: LeaveType.CASUAL,
        startDate: date,
        endDate: date,
        status: LeaveStatus.APPROVED,
        reason,
        isHalfDay,
        days: new Prisma.Decimal(days),
        source,
        isPaid,
      },
    });
  }

  // ── Clock-in / Clock-out ──
  async clockIn(userId: string, timestamp?: string, latitude?: number, longitude?: number, clientIp?: string) {
    await this.verifyLocation(latitude, longitude, clientIp);

    const current = new Date(timestamp ?? Date.now());
    const date = localDateOf(current);
    // Per-employee shift overrides the org default — so a 9-5 employee
    // doesn't get flagged LATE at 9:30 just because the org default is
    // a 10am start.
    const policy = await this.effectivePolicyFor(userId);

    // Reject clock-ins on declared holidays — both for accounting
    // cleanliness and to prevent accidental "I worked on a holiday" rows
    // that show up in the monthly summary as PRESENT. HR can add hours
    // manually if the employee genuinely worked.
    const holiday = await this.prisma.holiday.findFirst({
      where: { date: { equals: date } },
      select: { name: true },
    });
    if (holiday) {
      throw new BadRequestException(
        `Today is a declared holiday (${holiday.name}). Contact HR if you need to log work hours.`,
      );
    }

    // Reject clock-ins on non-working days (Sun in the default Mon-Sat
    // mask). Same rationale — keeps the dashboard counts honest.
    const dayOfWeek = current.getDay();
    const isWorkingDay = ((policy.workingDaysMask >> dayOfWeek) & 1) === 1;
    if (!isWorkingDay) {
      const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dayOfWeek];
      throw new BadRequestException(
        `${dayName} isn't a working day. Contact HR if you need to log work hours.`,
      );
    }

    const { status, lateMinutes } = this.resolveStatus(current, policy);

    return this.prisma.$transaction(async (tx) => {
      // Read first — once a check-in exists for the day, the row is
      // immutable (no re-check-in, no overwriting the status/time).
      const existing = await tx.attendance.findUnique({
        where: { userId_date: { userId, date } },
      });
      if (existing?.checkIn) {
        throw new BadRequestException(
          `Already clocked in today at ${existing.checkIn.toTimeString().slice(0, 5)}. Check-in is locked until tomorrow.`,
        );
      }

      const attendance = await tx.attendance.upsert({
        where: { userId_date: { userId, date } },
        update: { checkIn: current, status, lateMinutes },
        create: { userId, date, checkIn: current, status, lateMinutes },
      });

      // Only apply penalties on the FIRST successful check-in of the day —
      // re-clocking shouldn't rack up duplicate deductions.
      const isFirstClockInToday = !existing?.checkIn;
      let autoLeave: { id: string; days: number; isPaid: boolean; source: LeaveSource } | null =
        null;

      if (isFirstClockInToday && status === AttendanceStatus.HALF_DAY) {
        const isPaid = await this.decidePaid(userId, 0.5, current, policy);
        const created = await this.applyLeaveDeduction(
          tx,
          userId,
          0.5,
          date,
          LeaveSource.AUTO_HALF_DAY,
          isPaid,
          `Auto half-day: check-in at ${current.toTimeString().slice(0, 5)} (after ${String(policy.halfDayCutoffHour).padStart(2, "0")}:${String(policy.halfDayCutoffMinute).padStart(2, "0")} cutoff)`,
          true,
        );
        autoLeave = { id: created.id, days: 0.5, isPaid, source: LeaveSource.AUTO_HALF_DAY };
      } else if (isFirstClockInToday && status === AttendanceStatus.LATE) {
        // Count this month's LATE attendances (this one already saved).
        // Range from the already-localized `date` (midnight local) not the
        // raw clock-in timestamp, so the boundary matches how `date` is
        // stored. Otherwise an IST late-evening clock-in could land in the
        // "next month" range and miss the streak count.
        const { start, end } = this.monthRange(date);
        const monthLates = await tx.attendance.count({
          where: {
            userId,
            status: AttendanceStatus.LATE,
            date: { gte: start, lt: end },
          },
        });
        // Count auto-penalty leaves already applied this month for this user.
        const penaltiesApplied = await tx.leaveRequest.count({
          where: {
            userId,
            source: LeaveSource.AUTO_LATE_PENALTY,
            startDate: { gte: start, lt: end },
          },
        });
        // Each completed streak of `lateStreakThreshold` lates earns one
        // penalty; if we're now overdue (e.g. 6 lates and only 1 penalty
        // applied), apply one more.
        const owedPenalties = Math.floor(monthLates / policy.lateStreakThreshold);
        if (owedPenalties > penaltiesApplied) {
          const isPaid = await this.decidePaid(userId, 1, current, policy);
          const created = await this.applyLeaveDeduction(
            tx,
            userId,
            1,
            date,
            LeaveSource.AUTO_LATE_PENALTY,
            isPaid,
            `Auto late-streak penalty: ${monthLates} lates this month (threshold ${policy.lateStreakThreshold})`,
            false,
          );
          autoLeave = { id: created.id, days: 1, isPaid, source: LeaveSource.AUTO_LATE_PENALTY };
        }
      }

      return { attendance, autoLeave, policy };
    }).then(async (result) => {
      // After the transaction commits, recompute performance if an
      // auto-leave fired — unpaid auto-leaves shave the score. Best-effort:
      // a rollup failure shouldn't break the clock-in response.
      if (result.autoLeave) {
        try {
          await this.performance.rollupPerformanceScore(userId);
        } catch {
          /* non-fatal */
        }
      }
      return result;
    });
  }

  async clockOut(userId: string, timestamp?: string, latitude?: number, longitude?: number, clientIp?: string) {
    await this.verifyLocation(latitude, longitude, clientIp);
    const current = new Date(timestamp ?? Date.now());
    const date = localDateOf(current);
    const attendance = await this.prisma.attendance.findUnique({
      where: { userId_date: { userId, date } },
    });
    if (!attendance?.checkIn) {
      // Strict gating: clock-out requires a prior clock-in. We used to
      // forward to clockIn() here as a UX nicety, but the policy is now
      // "one shot each, no overwrites" — so a stray clock-out errors.
      throw new BadRequestException("You haven't clocked in today. Clock in first.");
    }
    if (attendance.checkOut) {
      // Once checked out, the row is immutable for the day. No fix-ups
      // from the UI — HR can correct mistakes directly if needed.
      throw new BadRequestException(
        `Already clocked out today at ${attendance.checkOut.toTimeString().slice(0, 5)}. Cannot modify.`,
      );
    }
    const rawHours = (current.getTime() - attendance.checkIn.getTime()) / 3_600_000;
    // Negative = clock-out before clock-in (shouldn't happen with the
    // "no overwrites" rule above, but defend in depth). Hard-cap the upper
    // end at MAX_REASONABLE_DAY_HOURS so the inevitable "I forgot to clock
    // out yesterday" case doesn't pollute payroll / hour reports with
    // 31-hour entries.
    const totalHours = Number(
      Math.max(0, Math.min(MAX_REASONABLE_DAY_HOURS, rawHours)).toFixed(2),
    );
    return this.prisma.attendance.update({
      where: { userId_date: { userId, date } },
      data: { checkOut: current, totalHours },
    });
  }

  // ── Today's status (used by topbar quick-access widget) ──
  async todayStatus(userId: string) {
    const now = new Date();
    const date = localDateOf(now);
    const policy = await this.effectivePolicyFor(userId);
    const office = await this.getOfficeSettings();
    const attendance = await this.prisma.attendance.findUnique({
      where: { userId_date: { userId, date } },
    });
    // Late count this month — drives the "approaching threshold" badge.
    const { start, end } = this.monthRange(now);
    const lateCount = await this.prisma.attendance.count({
      where: { userId, status: AttendanceStatus.LATE, date: { gte: start, lt: end } },
    });
    const paidLeavesUsed = await this.paidLeavesThisMonth(userId, now);
    const dayOfWeek = now.getDay(); // 0=Sun..6=Sat
    const isWorkingDay = ((policy.workingDaysMask >> dayOfWeek) & 1) === 1;
    return {
      today: attendance,
      policy,
      office: {
        geofenceEnabled: office.geofenceEnabled,
        name: office.name,
        radiusMeters: office.radiusMeters,
      },
      monthly: {
        lateCount,
        lateStreakThreshold: policy.lateStreakThreshold,
        paidLeavesUsed,
        monthlyPaidLeaveCap: policy.monthlyPaidLeaveCap,
      },
      isWorkingDay,
    };
  }

  // ── HR summary: per-employee monthly attendance counts ──
  async hrMonthlySummary(refMonth?: string) {
    // refMonth in YYYY-MM; defaults to current month
    const ref = refMonth ? new Date(`${refMonth}-01T00:00:00Z`) : new Date();
    const { start, end } = this.monthRange(ref);
    const rows = await this.prisma.attendance.groupBy({
      by: ["userId", "status"],
      where: { date: { gte: start, lt: end } },
      _count: { _all: true },
    });
    // Pivot into per-user totals.
    const byUser = new Map<string, { present: number; late: number; halfDay: number; absent: number }>();
    for (const r of rows) {
      const u = byUser.get(r.userId) ?? { present: 0, late: 0, halfDay: 0, absent: 0 };
      if (r.status === AttendanceStatus.PRESENT) u.present = r._count._all;
      else if (r.status === AttendanceStatus.LATE) u.late = r._count._all;
      else if (r.status === AttendanceStatus.HALF_DAY) u.halfDay = r._count._all;
      else if (r.status === AttendanceStatus.ABSENT) u.absent = r._count._all;
      byUser.set(r.userId, u);
    }
    const userIds = [...byUser.keys()];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const userById = new Map(users.map((u) => [u.id, u]));
    return [...byUser.entries()].map(([userId, counts]) => ({
      userId,
      user: userById.get(userId) ?? null,
      ...counts,
    }));
  }

  // ── Biometric punch ingestion ──
  // Called by BiometricService whenever a punch from an approved device
  // resolves to a mapped user. Mirrors clockIn / clockOut but:
  //   - skips the geo/IP gate (the device is by definition at the office)
  //   - never throws (the device shouldn't see HTTP errors — we silently
  //     skip holidays / non-working days and let HR adjust manually)
  //   - infers in vs out by ordering: first punch of the day is checkIn,
  //     subsequent punches roll forward the checkOut. The device doesn't
  //     know whether the user is arriving or leaving.
  // Returns a tagged result so the caller can mark the BiometricLog as
  // processed (or not) accordingly.
  async applyBiometricPunch(
    userId: string,
    punchAt: Date,
  ): Promise<
    | { applied: "checkIn"; attendance: { id: string } }
    | { applied: "checkOut"; attendance: { id: string } }
    | { applied: "skipped"; reason: string }
  > {
    const date = localDateOf(punchAt);

    // Same holiday/working-day gates as clockIn so a punch on a Sunday
    // or declared holiday doesn't silently get logged as PRESENT.
    const holiday = await this.prisma.holiday.findFirst({
      where: { date: { equals: date } },
      select: { name: true },
    });
    if (holiday) return { applied: "skipped", reason: `holiday:${holiday.name}` };

    const policy = await this.effectivePolicyFor(userId);
    const dayOfWeek = punchAt.getDay();
    const isWorkingDay = ((policy.workingDaysMask >> dayOfWeek) & 1) === 1;
    if (!isWorkingDay) return { applied: "skipped", reason: "non-working-day" };

    const existing = await this.prisma.attendance.findUnique({
      where: { userId_date: { userId, date } },
    });

    // ── No prior check-in → treat this punch as the day's check-in ──
    if (!existing?.checkIn) {
      const { status, lateMinutes } = this.resolveStatus(punchAt, policy);
      const result = await this.prisma.$transaction(async (tx) => {
        const attendance = await tx.attendance.upsert({
          where: { userId_date: { userId, date } },
          update: { checkIn: punchAt, status, lateMinutes },
          create: { userId, date, checkIn: punchAt, status, lateMinutes },
        });

        // Same auto half-day / late-streak penalty logic as clockIn.
        let autoLeave: { source: LeaveSource; days: number; isPaid: boolean } | null = null;
        if (status === AttendanceStatus.HALF_DAY) {
          const isPaid = await this.decidePaid(userId, 0.5, punchAt, policy);
          await this.applyLeaveDeduction(
            tx,
            userId,
            0.5,
            date,
            LeaveSource.AUTO_HALF_DAY,
            isPaid,
            `Auto half-day (biometric): punch at ${punchAt.toTimeString().slice(0, 5)} (after ${String(policy.halfDayCutoffHour).padStart(2, "0")}:${String(policy.halfDayCutoffMinute).padStart(2, "0")} cutoff)`,
            true,
          );
          autoLeave = { source: LeaveSource.AUTO_HALF_DAY, days: 0.5, isPaid };
        } else if (status === AttendanceStatus.LATE) {
          const { start, end } = this.monthRange(date);
          const monthLates = await tx.attendance.count({
            where: { userId, status: AttendanceStatus.LATE, date: { gte: start, lt: end } },
          });
          const penaltiesApplied = await tx.leaveRequest.count({
            where: {
              userId,
              source: LeaveSource.AUTO_LATE_PENALTY,
              startDate: { gte: start, lt: end },
            },
          });
          const owedPenalties = Math.floor(monthLates / policy.lateStreakThreshold);
          if (owedPenalties > penaltiesApplied) {
            const isPaid = await this.decidePaid(userId, 1, punchAt, policy);
            await this.applyLeaveDeduction(
              tx,
              userId,
              1,
              date,
              LeaveSource.AUTO_LATE_PENALTY,
              isPaid,
              `Auto late-streak penalty (biometric): ${monthLates} lates this month (threshold ${policy.lateStreakThreshold})`,
              false,
            );
            autoLeave = { source: LeaveSource.AUTO_LATE_PENALTY, days: 1, isPaid };
          }
        }
        return { attendance, autoLeave };
      });

      if (result.autoLeave) {
        // Non-fatal — same pattern as clockIn().
        try {
          await this.performance.rollupPerformanceScore(userId);
        } catch {
          /* swallow */
        }
        this.sendAutoLeaveNotification(userId, result.autoLeave).catch(() => undefined);
      }
      return { applied: "checkIn", attendance: { id: result.attendance.id } };
    }

    // ── Already checked in. Roll the checkOut forward to this punch IF
    // it's later than what we already have. Multiple out-punches (e.g.
    // employee stepped out and came back) just keep advancing the latest
    // departure time, which matches what payroll cares about. ──
    if (punchAt <= existing.checkIn) {
      // Defensive: a punch earlier than the recorded check-in is almost
      // always a device clock-drift artefact — ignore rather than rewrite
      // the day backwards.
      return { applied: "skipped", reason: "before-checkin" };
    }
    if (existing.checkOut && punchAt <= existing.checkOut) {
      return { applied: "skipped", reason: "not-later-than-checkout" };
    }
    const rawHours = (punchAt.getTime() - existing.checkIn.getTime()) / 3_600_000;
    const totalHours = Number(
      Math.max(0, Math.min(MAX_REASONABLE_DAY_HOURS, rawHours)).toFixed(2),
    );
    const updated = await this.prisma.attendance.update({
      where: { userId_date: { userId, date } },
      data: { checkOut: punchAt, totalHours },
    });
    return { applied: "checkOut", attendance: { id: updated.id } };
  }

  // Notify a user that an automatic deduction was applied. Fired by the
  // controller after clockIn() resolves; kept here so the service owns the
  // "what to say" copy.
  async sendAutoLeaveNotification(
    userId: string,
    autoLeave: { days: number; isPaid: boolean; source: LeaveSource },
  ) {
    const title =
      autoLeave.source === LeaveSource.AUTO_HALF_DAY
        ? "Half-day applied (late arrival)"
        : "Late-streak penalty applied";
    const paidLabel = autoLeave.isPaid ? "paid leave" : "unpaid leave (monthly cap exhausted)";
    await this.notifications.create(userId, {
      type: NotificationType.LEAVE_APPROVED,
      title,
      body: `${autoLeave.days} day${autoLeave.days === 1 ? "" : "s"} deducted as ${paidLabel}.`,
      link: "/leave",
    });
  }
}
