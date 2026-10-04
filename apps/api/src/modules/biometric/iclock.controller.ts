import { Controller, Get, Header, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { BiometricService } from "./biometric.service";

// ESSL / ZKTeco push-protocol endpoints. NOT under JwtAuthGuard — the
// device has no concept of bearer tokens, and shipping a guard that
// 401s would put the device into permanent backoff. Device identity is
// the `SN` query param; trust is enforced via BiometricDevice.approved
// (unapproved devices land punches in quarantine, never in Attendance).
//
// Mounted at /api/v1/iclock/* via the global prefix. Configure the
// device's "Server Address" to `<your-host>` and "Server Path" (if the
// firmware exposes one) to `/api/v1` — the device appends `/iclock/...`
// itself.
//
// Responses are plain text (the device parses string prefixes, not JSON).
// Every route sets text/plain explicitly so reverse proxies don't try to
// be helpful and rewrite it. @Header has to be method-scoped in Nest —
// applying it at the class level is a typing error.
@Controller("iclock")
export class IclockController {
  constructor(private readonly biometric: BiometricService) {}

  // Handshake — device asks "what's my config?" every time it boots.
  @Get("cdata")
  @Header("Content-Type", "text/plain; charset=utf-8")
  handshake(@Query("SN") sn: string, @Query("options") options?: string) {
    return this.biometric.handshake(sn, options);
  }

  // Punch upload + device-side operations log. Body is plain text; the
  // module's NestModule.configure() registers express.text() on these
  // routes so `req.body` arrives as a string here.
  @Post("cdata")
  @Header("Content-Type", "text/plain; charset=utf-8")
  push(
    @Query("SN") sn: string,
    @Query("table") table: string | undefined,
    @Req() req: Request,
  ) {
    const body = typeof req.body === "string" ? req.body : "";
    return this.biometric.handlePush(sn, table, body);
  }

  // Device's "anything queued for me?" poll. We always say "no" right
  // now — the hook is here so we can push commands later (sync user
  // list, force-reboot, etc.) without changing the device config.
  @Get("getrequest")
  @Header("Content-Type", "text/plain; charset=utf-8")
  getrequest(@Query("SN") sn: string) {
    return this.biometric.getrequest(sn);
  }

  // Ack channel for previously-queued commands the device finished.
  @Post("devicecmd")
  @Header("Content-Type", "text/plain; charset=utf-8")
  devicecmd(@Query("SN") sn: string, @Req() req: Request) {
    const body = typeof req.body === "string" ? req.body : "";
    return this.biometric.devicecmd(sn, body);
  }
}
