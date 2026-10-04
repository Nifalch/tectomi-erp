import { Injectable, Logger } from "@nestjs/common";
import * as nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import * as fs from "fs";
import * as path from "path";
import { PrismaService } from "../prisma/prisma.service";
import {
  BrandInfo,
  GenericEmailData,
  HEADER_LOGO_CID,
  FOOTER_LOGO_CID,
  InvoiceEmailData,
  OnboardingEmailData,
  ProjectCompleteEmailData,
  ProposalEmailData,
  renderGenericHtml,
  renderGenericText,
  renderInvoiceHtml,
  renderInvoiceText,
  renderOnboardingHtml,
  renderOnboardingText,
  renderProjectCompleteHtml,
  renderProjectCompleteText,
  renderProposalHtml,
  renderProposalText,
} from "./mail-templates";

/**
 * SMTP-backed mail service.
 *
 * Outbound messages fall into one of five shapes — each shape has a
 * dedicated typed entry point that builds its own visually-distinct
 * HTML body:
 *
 *   sendProposalEmail(to, data)         — cover-sheet style
 *   sendInvoiceEmail(to, data)          — statement style
 *   sendOnboardingEmail(to, data)       — welcome card
 *   sendProjectCompleteEmail(to, data)  — delivery card
 *   sendGenericEmail(to, subject, data) — magic links, password resets
 *
 * Plus a legacy `sendTemplateEmail(to, subject, payload)` that maps
 * the old flat key/value payload onto the generic template so old
 * call sites keep working without churn.
 *
 * Both bundled brand logos (the white wordmark for the dark masthead,
 * the black wordmark for the white footer) are embedded as inline
 * CID attachments on every send — that's the only reliable way to
 * make the logos render in clients that can't reach the app URL.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  private fromAddress: string = "";
  private configSummary: string | null = null;
  private cacheLoadedAt: number = 0;
  private readonly CACHE_TTL_MS = 60_000;
  private brandCache: BrandInfo | null = null;
  private brandCacheLoadedAt: number = 0;

  constructor(private readonly prisma: PrismaService) {}

  invalidateTransport() {
    this.transporter = null;
    this.cacheLoadedAt = 0;
    this.brandCache = null;
    this.brandCacheLoadedAt = 0;
  }

  // ── Typed send entry points ────────────────────────────────────────────

  async sendProposalEmail(to: string, data: ProposalEmailData): Promise<void> {
    const brand = await this.getBrand();
    const subject =
      data.variant === "resent"
        ? `Updated proposal — ${data.projectName}`
        : `Your proposal — ${data.projectName}`;
    return this.dispatch(to, subject, renderProposalHtml(data, brand), renderProposalText(data, brand));
  }

  async sendInvoiceEmail(to: string, data: InvoiceEmailData): Promise<void> {
    const brand = await this.getBrand();
    const subject = `Invoice ${data.invoiceNumber} — ${data.amountFormatted} due ${data.dueDate}`;
    return this.dispatch(to, subject, renderInvoiceHtml(data, brand), renderInvoiceText(data, brand));
  }

  async sendOnboardingEmail(to: string, data: OnboardingEmailData): Promise<void> {
    const brand = await this.getBrand();
    const subject = `Welcome to your ${brand.name} portal`;
    return this.dispatch(to, subject, renderOnboardingHtml(data, brand), renderOnboardingText(data, brand));
  }

  async sendProjectCompleteEmail(to: string, data: ProjectCompleteEmailData): Promise<void> {
    const brand = await this.getBrand();
    const subject = `${data.projectName} — wrapped and delivered`;
    return this.dispatch(to, subject, renderProjectCompleteHtml(data, brand), renderProjectCompleteText(data, brand));
  }

  async sendGenericEmail(to: string, subject: string, data: GenericEmailData): Promise<void> {
    const brand = await this.getBrand();
    return this.dispatch(to, subject, renderGenericHtml(subject, data, brand), renderGenericText(subject, data, brand));
  }

  /**
   * Legacy flat-payload send. Translates the old `{name, link,
   * tempPassword, portalUrl, ttlMinutes, ...}` shape into the generic
   * template. Kept so existing call sites (auth, hr, tasks, staff
   * requests) continue to work — they all get the new branded
   * rendering for free.
   */
  async sendTemplateEmail(
    to: string,
    subject: string,
    payload: Record<string, string>,
  ): Promise<void> {
    return this.sendGenericEmail(to, subject, legacyPayloadToGeneric(payload));
  }

  // ── Test send (called from Settings → Email) ───────────────────────────

  async sendTestEmail(args: {
    host: string;
    port: number;
    user: string;
    pass: string;
    from?: string;
    to: string;
  }): Promise<{ ok: true } | { ok: false; error: string }> {
    const transport = nodemailer.createTransport({
      host: args.host,
      port: args.port,
      secure: args.port === 465,
      auth: { user: args.user, pass: args.pass },
    });
    const brand = await this.getBrand();
    try {
      await transport.verify();
      const subject = `${brand.name} — SMTP test email`;
      const data: GenericEmailData = {
        kicker: "SMTP diagnostic",
        documentTitle: "Settings · Email",
        headline: "Your SMTP configuration is working.",
        intro:
          "This message proves the platform can deliver mail through your configured SMTP server. You can now safely send proposals, invoices, onboarding and project notifications from production.",
        extras: [
          { label: "Host", value: `${args.host}:${args.port}` },
          { label: "Secure", value: args.port === 465 ? "Yes (SMTPS)" : "STARTTLS / plain" },
          { label: "From", value: args.from || args.user },
        ],
        cta: null,
        footerNote: "You can rotate these credentials anytime under Settings → Email.",
      };
      await transport.sendMail({
        from: args.from || args.user,
        to: args.to,
        subject,
        text: renderGenericText(subject, data, brand),
        html: renderGenericHtml(subject, data, brand),
        attachments: buildLogoAttachments(),
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  async getStatus(): Promise<{ enabled: boolean; summary: string | null }> {
    await this.ensureTransport();
    return { enabled: this.transporter !== null, summary: this.configSummary };
  }

  // ── Transport + brand caching ──────────────────────────────────────────

  private async dispatch(to: string, subject: string, html: string, text: string): Promise<void> {
    await this.ensureTransport();
    if (!this.transporter) {
      this.logger.warn(`[mail-stub] Would have sent to ${to} — subject: "${subject}"`);
      return;
    }
    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to,
        subject,
        html,
        text,
        attachments: buildLogoAttachments(),
      });
      this.logger.log(`Sent "${subject}" → ${to}`);
    } catch (err) {
      this.logger.error(`Failed to send "${subject}" → ${to}: ${(err as Error).message}`);
    }
  }

  private async ensureTransport(): Promise<void> {
    if (this.transporter && Date.now() - this.cacheLoadedAt < this.CACHE_TTL_MS) return;

    const settings = await this.prisma.organizationSettings.findFirst();
    const host = settings?.smtpHost?.trim() || process.env.SMTP_HOST?.trim() || "";
    const port = settings?.smtpPort ?? Number(process.env.SMTP_PORT ?? 587);
    const user = settings?.smtpUser?.trim() || process.env.SMTP_USER?.trim() || "";
    const pass = settings?.smtpPass?.trim() || process.env.SMTP_PASS?.trim() || "";
    const from = (settings?.smtpFrom?.trim() || process.env.SMTP_FROM?.trim() || user);
    const enabled = settings ? settings.smtpEnabled : true;

    const isPlaceholder = (v: string) =>
      !v || v.includes("example.com") || v === "changeme" || v === "noreply@example.com";

    if (!enabled || isPlaceholder(host) || isPlaceholder(user) || isPlaceholder(pass)) {
      this.transporter = null;
      this.configSummary = !enabled
        ? "Mail disabled in Settings → Email."
        : "SMTP credentials missing — configure them in Settings → Email.";
      this.cacheLoadedAt = Date.now();
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    this.fromAddress = from;
    this.configSummary = `Mail enabled via ${host}:${port} as ${from}`;
    this.cacheLoadedAt = Date.now();
    this.logger.log(this.configSummary);
  }

  private async getBrand(): Promise<BrandInfo> {
    if (this.brandCache && Date.now() - this.brandCacheLoadedAt < this.CACHE_TTL_MS) {
      return this.brandCache;
    }
    const s = await this.prisma.organizationSettings.findFirst();
    this.brandCache = {
      name: s?.name?.trim() || "Tectomi ERP",
      logoUrl: s?.logoUrl?.trim() || null,
      email: s?.email?.trim() || null,
      phone: s?.phone?.trim() || null,
      website: s?.website?.trim() || null,
      addressLine1: s?.addressLine1?.trim() || null,
      city: s?.city?.trim() || null,
      country: s?.country?.trim() || null,
    };
    this.brandCacheLoadedAt = Date.now();
    return this.brandCache;
  }
}

// ── Legacy payload → generic template ───────────────────────────────────

/**
 * Translate the flat {name, link, tempPassword, portalUrl, ttlMinutes,
 * note, ...} payload used by older auth / magic-link / staff-request
 * call sites into the typed GenericEmailData structure.
 */
function legacyPayloadToGeneric(p: Record<string, string>): GenericEmailData {
  const known = new Set(["name", "link", "tempPassword", "portalUrl", "ttlMinutes", "note"]);
  const extras: Array<{ label: string; value: string }> = [];
  if (p.portalUrl) extras.push({ label: "Portal URL", value: p.portalUrl });
  for (const [k, v] of Object.entries(p)) {
    if (!known.has(k)) extras.push({ label: humanize(k), value: v });
  }
  return {
    headline: p.note ? p.note.split("\n")[0] : "Hello from Tectomi ERP",
    greeting: p.name ? `Hi ${p.name},` : undefined,
    intro: p.note,
    code: p.tempPassword ? { label: "Temporary password", value: p.tempPassword } : undefined,
    extras: extras.length ? extras : undefined,
    cta: p.link ? { label: "Open", url: p.link } : null,
    footerNote: p.ttlMinutes ? `This link expires in ${p.ttlMinutes} minutes.` : undefined,
  };
}

function humanize(k: string): string {
  return k
    .replace(/[_-]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Inline-attachment helpers ───────────────────────────────────────────

const HEADER_LOGO_PATH = path.join(__dirname, "assets", "logo-white-inverted.png");
const FOOTER_LOGO_PATH = path.join(__dirname, "assets", "logo-white.png");

function safeReadBuf(p: string): Buffer | null {
  try {
    return fs.readFileSync(p);
  } catch {
    return null;
  }
}
const HEADER_LOGO_BUF = safeReadBuf(HEADER_LOGO_PATH);
const FOOTER_LOGO_BUF = safeReadBuf(FOOTER_LOGO_PATH);

function buildLogoAttachments(): Array<{
  filename: string;
  content: Buffer;
  cid: string;
  contentType: string;
  contentDisposition: "inline";
}> {
  const out: Array<{
    filename: string;
    content: Buffer;
    cid: string;
    contentType: string;
    contentDisposition: "inline";
  }> = [];
  if (HEADER_LOGO_BUF) {
    out.push({
      filename: "logo.png",
      content: HEADER_LOGO_BUF,
      cid: HEADER_LOGO_CID,
      contentType: "image/png",
      contentDisposition: "inline",
    });
  }
  if (FOOTER_LOGO_BUF) {
    out.push({
      filename: "logo-dark.png",
      content: FOOTER_LOGO_BUF,
      cid: FOOTER_LOGO_CID,
      contentType: "image/png",
      contentDisposition: "inline",
    });
  }
  return out;
}
