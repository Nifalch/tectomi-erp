import { Body, Controller, Get, Post, Query, Req, Res, UseGuards, HttpCode } from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { env } from "../../../config/env";
import { PORTAL_COOKIE, ClientPortalGuard } from "../client-portal.guard";
import { RequestLinkDto } from "./dto";
import { PortalAuthService } from "./portal-auth.service";

@Controller("client-portal/auth")
@UseGuards(ThrottlerGuard)
export class PortalAuthController {
  constructor(private readonly auth: PortalAuthService) {}

  @Post("request-link")
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } })
  async requestLink(@Body() dto: RequestLinkDto, @Req() req: Request) {
    await this.auth.requestLink(dto.email.toLowerCase(), req.ip ?? null);
    return { ok: true };
  }

  @Get("verify")
  async verify(@Query("token") token: string, @Req() req: Request, @Res() res: Response) {
    if (!token) return res.redirect(`${env.portalUrl}/portal/login?e=invalid`);
    try {
      const { sessionRaw, expiresAt } = await this.auth.verify(
        token,
        req.ip ?? null,
        req.headers["user-agent"] ?? null,
      );
      // Mark the cookie Secure whenever the portal is served over HTTPS,
      // not just when NODE_ENV === production — a staging deployment on
      // https://staging.example.com still demands Secure flag. We fall
      // back to insecure only when the portal URL is http:// (dev /
      // local). Without this, a staging URL shared with a real client
      // could leak the session cookie in cleartext.
      const portalIsHttps = env.portalUrl.startsWith("https://");
      res.cookie(PORTAL_COOKIE, sessionRaw, {
        httpOnly: true,
        secure: portalIsHttps,
        // sameSite=lax balances UX (cookie attached on top-level magic
        // link click) with CSRF protection (third-party POSTs blocked).
        // Cross-origin SPA fetches still need credentials:include from
        // an allowlisted origin (CORS already enforced in main.ts).
        sameSite: portalIsHttps ? "none" : "lax",
        path: "/",
        expires: expiresAt,
      });
      return res.redirect(`${env.portalUrl}/portal`);
    } catch {
      return res.redirect(`${env.portalUrl}/portal/login?e=invalid`);
    }
  }

  @Post("logout")
  @UseGuards(ClientPortalGuard)
  @HttpCode(200)
  async logout(@Req() req: Request, @Res() res: Response) {
    const raw = req.cookies?.[PORTAL_COOKIE];
    if (raw) await this.auth.revoke(raw);
    res.clearCookie(PORTAL_COOKIE, { path: "/" });
    return res.json({ ok: true });
  }
}
