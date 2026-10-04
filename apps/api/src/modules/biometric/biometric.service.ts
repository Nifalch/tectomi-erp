import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AttendanceService } from "../attendance/attendance.service";

// ─── ESSL / ZKTeco "Push Protocol" — quick primer ───────────────────────
// Device dials OUT to the URL configured in its Comm → Cloud Server menu.
// All four endpoints below are plain HTTP, no JSON — body is tab-separated
// text. The device cares only about the response BODY (status line is
// always 200 with a few text directives). Response codes outside 2xx put
// the device into "server down" backoff mode and stall punch syncing.
//
// Endpoints we implement (mounted at /api/v1/iclock/* via the controller):
//
//   GET  /cdata?SN=<sn>&options=all&pushver=2.4.1
//        Handshake — first call after the device boots. We must answer
//        with `GET OPTION FROM:<sn>` plus a config block (TransFlag,
//        Stamp, etc). Device caches this until ServerVer changes.
//
//   POST /cdata?SN=<sn>&table=ATTLOG&Stamp=<n>
//        Punch upload. Body is N lines, each:
//          <enroll-id>\t<YYYY-MM-DD HH:MM:SS>\t<status>\t<verify>\t<workcode>\t<reserved>\t<reserved>
//        Response must echo `OK: <count>` — anything else and the device
//        re-uploads the same batch forever.
//
//   POST /cdata?SN=<sn>&table=OPERLOG  (and others)
//        Device-side operations (user added, fingerprint enrolled, door
//        opened, etc). We log them but don't act — pure audit trail.
//
//   GET  /getrequest?SN=<sn>
//        Device polls every `Delay` seconds asking "anything for me?".
//        Reply `OK` if nothing queued; reply with `C:<id>:<cmd>` to push
//        a command. We just ack for now.
//
//   POST /devicecmd?SN=<sn>
//        Acks for commands the device ran. We log and ack.
//
// ──────────────────────────────────────────────────────────────────────

const PUSH_OK = "OK";

@Injectable()
export class BiometricService {
  private readonly logger = new Logger(BiometricService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly attendance: AttendanceService,
  ) {}

  // ── Push-protocol handlers (called by IclockController) ──────────────

  // GET /iclock/cdata — initial handshake. Auto-registers unknown SNs
  // (as `approved=false` — quarantined until HR approves) so admins can
  // see them in the device list immediately after first power-on.
  async handshake(sn: string, _options?: string): Promise<string> {
    if (!sn) throw new BadRequestException("missing SN");
    const device = await this.touchDevice(sn);

    // Stamp values let the device know whether its cached config is
    // stale. We use the device's updatedAt epoch so any admin change
    // (rename, approve toggle) causes the device to re-handshake.
    const stamp = Math.floor(device.updatedAt.getTime() / 1000);

    // TransFlag selects which tables the device pushes. We want
    // AttLog (punches) and OperLog (admin events). TimeZone is in
    // hours — IST = 5.5 isn't supported, so device clocks should be
    // set to the office TZ directly via the device menu.
    return [
      `GET OPTION FROM:${sn}`,
      `Stamp=${stamp}`,
      `OpStamp=${stamp}`,
      `ErrorDelay=30`,
      `Delay=10`,
      `TransTimes=00:00;14:00`,
      `TransInterval=1`,
      `TransFlag=TransData AttLog OpLog`,
      `Realtime=1`,
      `Encrypt=None`,
      ``, // trailing newline matters on some firmware
    ].join("\n");
  }

  // POST /iclock/cdata — punch upload (table=ATTLOG) or device ops.
  async handlePush(sn: string, table: string | undefined, body: string): Promise<string> {
    if (!sn) throw new BadRequestException("missing SN");
    const device = await this.touchDevice(sn);
    const lines = (body ?? "").split(/\r?\n/).filter((l) => l.trim().length > 0);

    if (!table || table.toUpperCase() === "ATTLOG") {
      let saved = 0;
      for (const line of lines) {
        const parsed = parseAttlogLine(line);
        if (!parsed) {
          this.logger.warn(`unparseable ATTLOG line from ${sn}: ${line}`);
          continue;
        }
        const stored = await this.ingestPunch(device.id, parsed, line);
        if (stored) saved++;
      }
      // Device expects `OK: <count>` — the count is informational, the
      // `OK:` prefix is the only thing it actually parses.
      return `OK: ${saved}`;
    }

    // OPERLOG and friends — we keep the body in the logs for traceability
    // but don't model device-side ops yet.
    this.logger.log(`device ${sn} push table=${table} (${lines.length} lines)`);
    return PUSH_OK;
  }

  // GET /iclock/getrequest — poll for queued commands. None for now.
  async getrequest(sn: string): Promise<string> {
    if (!sn) throw new BadRequestException("missing SN");
    await this.touchDevice(sn);
    return PUSH_OK;
  }

  // POST /iclock/devicecmd — device's response to a previously queued
  // command. We just ack.
  async devicecmd(sn: string, _body: string): Promise<string> {
    if (!sn) throw new BadRequestException("missing SN");
    await this.touchDevice(sn);
    return PUSH_OK;
  }

  // ── Admin endpoints (used by BiometricController, JWT-guarded) ──────

  listDevices() {
    return this.prisma.biometricDevice.findMany({
      orderBy: { firstSeenAt: "desc" },
      include: { _count: { select: { logs: true } } },
    });
  }

  async updateDevice(id: string, dto: { name?: string; approved?: boolean }) {
    const device = await this.prisma.biometricDevice.findUnique({ where: { id } });
    if (!device) throw new NotFoundException("device not found");
    const updated = await this.prisma.biometricDevice.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        approved: dto.approved ?? undefined,
      },
    });
    // If the device was just approved, replay every quarantined punch
    // we've accumulated — otherwise HR would see attendance for "today
    // onwards" only and lose any punches captured during the approval
    // wait. Best-effort: failures here don't block the approve action.
    if (dto.approved && !device.approved) {
      this.reprocessPending(updated.id).catch((err) =>
        this.logger.error(`reprocessPending failed for ${updated.id}: ${err?.message ?? err}`),
      );
    }
    return updated;
  }

  removeDevice(id: string) {
    return this.prisma.biometricDevice.delete({ where: { id } });
  }

  // Distinct enroll IDs we've seen punches for but haven't mapped to a
  // user yet — populates HR's "map device IDs to employees" screen.
  async unmappedEnrollments() {
    const rows = await this.prisma.biometricLog.findMany({
      where: { userId: null },
      select: { deviceId: true, deviceUserId: true, punchAt: true },
      orderBy: { punchAt: "desc" },
      take: 500,
    });
    const grouped = new Map<
      string,
      { deviceId: string; deviceUserId: string; punchCount: number; lastSeen: Date }
    >();
    for (const r of rows) {
      const key = `${r.deviceId}|${r.deviceUserId}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.punchCount += 1;
        if (r.punchAt > existing.lastSeen) existing.lastSeen = r.punchAt;
      } else {
        grouped.set(key, {
          deviceId: r.deviceId,
          deviceUserId: r.deviceUserId,
          punchCount: 1,
          lastSeen: r.punchAt,
        });
      }
    }
    return [...grouped.values()].sort((a, b) => +b.lastSeen - +a.lastSeen);
  }

  // Sets (or clears, with empty/null) a user's biometric enroll ID, then
  // retroactively links every previously-unmapped log with that ID to
  // them and replays the resulting punches into Attendance. This is what
  // makes "approve device → map IDs → history backfills" feel magical.
  async setUserEnrollId(userId: string, enrollId?: string | null) {
    const trimmed = enrollId?.trim();
    const value = trimmed && trimmed.length > 0 ? trimmed : null;

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { biometricEnrollId: value },
      select: { id: true, biometricEnrollId: true },
    });

    if (!value) {
      // Clearing the mapping — orphan future logs from this user. We
      // don't unwind already-applied Attendance rows; that would be too
      // destructive to do automatically. HR can manually fix if needed.
      return { user, linkedLogs: 0, replayed: 0 };
    }

    // Find every unprocessed log across approved devices with this
    // enroll ID and link them to the user.
    const link = await this.prisma.biometricLog.updateMany({
      where: {
        deviceUserId: value,
        userId: null,
        device: { approved: true },
      },
      data: { userId: user.id },
    });

    const replayed = await this.replayLogsForUser(user.id);
    return { user, linkedLogs: link.count, replayed };
  }

  async listLogs(limit: number) {
    return this.prisma.biometricLog.findMany({
      orderBy: { punchAt: "desc" },
      take: Math.min(Math.max(limit, 1), 500),
      include: {
        device: { select: { id: true, serialNumber: true, name: true } },
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }

  // Manually replay any pending logs for a device — used after admin
  // toggles `approved` from false → true.
  async reprocessPending(deviceId: string) {
    const device = await this.prisma.biometricDevice.findUnique({ where: { id: deviceId } });
    if (!device || !device.approved) return { replayed: 0 };

    // Pull all unprocessed logs in chronological order. Order matters:
    // first punch of a day must become checkIn before subsequent punches
    // can be matched as checkOut.
    const pending = await this.prisma.biometricLog.findMany({
      where: { deviceId, processed: false },
      orderBy: { punchAt: "asc" },
    });

    let replayed = 0;
    for (const log of pending) {
      // Re-resolve userId in case mappings were added since the log
      // was first captured.
      const userId = log.userId ?? (await this.lookupUserByEnrollId(log.deviceUserId));
      if (!userId) continue;
      const applied = await this.applyLog(log.id, userId, log.punchAt);
      if (applied) replayed++;
    }
    return { replayed };
  }

  // ── Internal helpers ────────────────────────────────────────────────

  private async touchDevice(sn: string) {
    // Use upsert so unknown devices auto-register on first contact —
    // makes onboarding "plug device in, configure URL, see it in admin"
    // a single step instead of forcing HR to type the SN themselves.
    return this.prisma.biometricDevice.upsert({
      where: { serialNumber: sn },
      create: { serialNumber: sn, lastSeenAt: new Date() },
      update: { lastSeenAt: new Date() },
    });
  }

  // Inserts a BiometricLog (dedup-safe) and, if the device is approved
  // and the enroll ID is mapped, immediately syncs it to Attendance.
  // Returns true if the log was newly stored, false if it was a dupe.
  private async ingestPunch(
    deviceId: string,
    parsed: ParsedPunch,
    raw: string,
  ): Promise<boolean> {
    const userId = await this.lookupUserByEnrollId(parsed.deviceUserId);
    const device = await this.prisma.biometricDevice.findUnique({
      where: { id: deviceId },
      select: { approved: true },
    });

    // The (deviceId, deviceUserId, punchAt) unique constraint dedupes the
    // common case of the device retrying after a flaky network. We don't
    // want N copies, so swallow P2002 collisions silently.
    try {
      const log = await this.prisma.biometricLog.create({
        data: {
          deviceId,
          deviceUserId: parsed.deviceUserId,
          userId: userId ?? null,
          punchAt: parsed.punchAt,
          punchType: parsed.punchType,
          verifyMode: parsed.verifyMode,
          raw,
        },
      });

      // Only push to Attendance once everything is mapped + approved.
      if (device?.approved && userId) {
        await this.applyLog(log.id, userId, log.punchAt);
      }
      return true;
    } catch (err: unknown) {
      // P2002 = Prisma unique constraint violation → it's a re-upload,
      // not an error. Anything else surfaces normally.
      if (typeof err === "object" && err && (err as { code?: string }).code === "P2002") {
        return false;
      }
      throw err;
    }
  }

  private async applyLog(logId: string, userId: string, punchAt: Date): Promise<boolean> {
    const result = await this.attendance.applyBiometricPunch(userId, punchAt);
    // Mark `processed=true` whether we applied or intentionally skipped
    // (holiday / non-working day / out-of-order). The "skipped" reason
    // is preserved indirectly via the BiometricLog.raw + Attendance gap
    // so HR can audit later.
    await this.prisma.biometricLog.update({
      where: { id: logId },
      data: { processed: true, appliedAt: new Date() },
    });
    return result.applied !== "skipped";
  }

  private async replayLogsForUser(userId: string) {
    const pending = await this.prisma.biometricLog.findMany({
      where: {
        userId,
        processed: false,
        device: { approved: true },
      },
      orderBy: { punchAt: "asc" },
    });
    let count = 0;
    for (const log of pending) {
      if (await this.applyLog(log.id, userId, log.punchAt)) count++;
    }
    return count;
  }

  private async lookupUserByEnrollId(deviceUserId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { biometricEnrollId: deviceUserId },
      select: { id: true },
    });
    return user?.id ?? null;
  }
}

// ── ATTLOG line parser ──────────────────────────────────────────────────
// Lines look like:
//   123\t2026-05-23 09:12:33\t0\t1\t0\t0\t0
// Fields: enroll-id, timestamp, status, verify, workcode, reserved×2.
// Some firmware emits only the first 4 fields; we accept that too.
type ParsedPunch = {
  deviceUserId: string;
  punchAt: Date;
  punchType: number;
  verifyMode: number;
};

function parseAttlogLine(line: string): ParsedPunch | null {
  const parts = line.split(/\t+/).map((s) => s.trim());
  if (parts.length < 2) return null;
  const [deviceUserId, ts, status = "0", verify = "0"] = parts;
  if (!deviceUserId || !ts) return null;
  const punchAt = parsePunchTimestamp(ts);
  if (!punchAt) return null;
  return {
    deviceUserId,
    punchAt,
    punchType: Number.parseInt(status, 10) || 0,
    verifyMode: Number.parseInt(verify, 10) || 0,
  };
}

// ZK pushes timestamps as plain "YYYY-MM-DD HH:MM:SS" with no timezone.
// They reflect the device's local clock — which HR configures via the
// device menu and which should match the server's local clock. We parse
// as local time (NOT UTC) so a 09:12 punch becomes 09:12 in the server's
// timezone, matching how manual clock-ins behave.
function parsePunchTimestamp(ts: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2}):(\d{2})$/.exec(ts.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se));
  return Number.isNaN(date.getTime()) ? null : date;
}
