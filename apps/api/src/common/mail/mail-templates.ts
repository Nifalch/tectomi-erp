/* ──────────────────────────────────────────────────────────────────────
   Branded email templates.

   Four distinct HTML treatments share one masthead/footer shell:

     • proposal        — cover-sheet style: project name as display
                          type, 3-stat strip (Investment · Timeline ·
                          Valid Until), Prepared-For / Prepared-By
                          line, scope summary list. Reads like the
                          opening page of the proposal PDF.

     • invoice         — statement-style: invoice number, oversized
                          AMOUNT DUE figure, Due-By / Issued-On /
                          Project meta strip, line-item summary,
                          "Pay now" CTA wording.

     • onboarding      — welcome card: warm intro, 3-cell feature
                          grid (Projects · Proposals · Invoices), and
                          one prominent "Open your portal" CTA.

     • project-complete— delivery card: DELIVERED pill, project name,
                          duration / lead / completed-on stats, thank
                          you + what's-next checklist, portal CTA.

   The shell (HTML head, masthead with logo, footer with brand strip,
   responsive media queries) is identical across kinds — every email
   carries the same brand signature even though the bodies differ.

   No emoji. No icon fonts. The visual identity comes from typography
   (Inter/system stack), tight tracking, hairline + heavy black rules,
   and a single brand colour (pure black).
   ────────────────────────────────────────────────────────────────────── */

import { env } from "../../config/env";

// CIDs match buildLogoAttachments() in mail.service.ts.
export const HEADER_LOGO_CID = "nuro-logo-light@nuro7";
export const FOOTER_LOGO_CID = "nuro-logo-dark@nuro7";

// ── Public template payloads ─────────────────────────────────────────────

export interface BrandInfo {
  name: string;
  logoUrl: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  addressLine1: string | null;
  city: string | null;
  country: string | null;
}

export interface ProposalEmailData {
  recipientName?: string | null;
  clientName: string;
  projectName: string;
  proposalNumber?: string | null;
  /** ISO date string when the proposal was prepared. */
  preparedOn?: string | null;
  /** Display-formatted "valid until" date — e.g. "30 June 2026". */
  validUntil?: string | null;
  /** Already-formatted currency string — e.g. "₹4,50,000". */
  investment?: string | null;
  /** Free-form timeline label — e.g. "12 weeks". */
  timeline?: string | null;
  /** Short executive blurb (the proposal's description / lede). */
  summary?: string | null;
  /** Optional scope items shown as a bulleted "WHAT'S INCLUDED" list. */
  inclusions?: string[];
  preparedBy?: string | null;
  /** URL of the proposal in the client portal. */
  portalUrl: string;
  /** "sent" vs "resent" controls the eyebrow + intro wording. */
  variant: "sent" | "resent";
}

export interface InvoiceEmailData {
  recipientName?: string | null;
  clientName: string;
  invoiceNumber: string;
  /** Already-formatted total — e.g. "₹4,50,000". */
  amountFormatted: string;
  /** Already-formatted due date — e.g. "30 June 2026". */
  dueDate: string;
  /** Already-formatted issue date. */
  issuedOn?: string | null;
  projectName?: string | null;
  /** Optional PO / client reference number. */
  referenceNumber?: string | null;
  /** Optional one-line bank/payment instruction summary. */
  paymentInstructions?: string | null;
  portalUrl: string;
}

export interface OnboardingEmailData {
  recipientName?: string | null;
  clientName: string;
  portalSignInUrl: string;
  /** Minutes until the magic link expires. */
  linkTtlMinutes: number;
}

export interface ProjectCompleteEmailData {
  recipientName?: string | null;
  clientName: string;
  projectName: string;
  /** Already-formatted completion date. */
  completedOn: string;
  /** Optional duration label — e.g. "12 weeks". */
  duration?: string | null;
  /** Project manager display name. */
  projectLead?: string | null;
  /** Project manager email — appended next to the lead name when present. */
  projectLeadEmail?: string | null;
  portalUrl: string;
}

// ── Public renderers ─────────────────────────────────────────────────────

export function renderProposalHtml(data: ProposalEmailData, brand: BrandInfo): string {
  const subject =
    data.variant === "resent"
      ? `Updated proposal — ${data.projectName}`
      : `Your proposal — ${data.projectName}`;
  const eyebrow = data.variant === "resent" ? "Proposal · Updated" : "Proposal";
  const intro =
    data.variant === "resent"
      ? `We've revised the proposal for <strong>${escape(data.projectName)}</strong> based on your feedback. The headline numbers and timeline are summarised below; the full revised document is one tap away.`
      : `Thank you for the opportunity to scope <strong>${escape(data.projectName)}</strong>. The headline numbers, timeline and key inclusions are summarised below — the full document, with scope, deliverables and terms, lives in your portal.`;

  const stats = [
    data.investment && { label: "Investment", value: data.investment },
    data.timeline && { label: "Timeline", value: data.timeline },
    data.validUntil && { label: "Valid until", value: data.validUntil },
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  const body = `
    ${renderEyebrow(eyebrow)}
    ${renderDisplayHeadline(data.projectName)}
    ${data.proposalNumber ? renderRefLine(`N° ${data.proposalNumber}`, data.preparedOn ?? null) : ""}
    ${renderHairline()}
    ${renderGreeting(data.recipientName ?? data.clientName)}
    <p style="margin:0 0 26px;font-size:15px;line-height:1.6;color:${ZINC_700};">${intro}</p>
    ${stats.length ? renderStatsStrip(stats) : ""}
    ${renderPreparedLine(data.clientName, data.preparedBy ?? brand.name)}
    ${data.summary ? renderQuoteBlock(data.summary) : ""}
    ${data.inclusions && data.inclusions.length ? renderInclusionList(data.inclusions) : ""}
    ${renderCta("View proposal", data.portalUrl)}
    ${renderFooterNote(
      data.validUntil
        ? `This proposal is valid until ${escape(data.validUntil)}. Reply directly to this email if you need anything clarified before accepting.`
        : `Reply directly to this email if you need anything clarified before accepting.`,
    )}
  `;

  return renderShell({
    subject,
    preheader: stripTags(intro),
    documentTitle: data.proposalNumber ? `Proposal · N° ${data.proposalNumber}` : "Proposal",
    bodyHtml: body,
    brand,
  });
}

export function renderInvoiceHtml(data: InvoiceEmailData, brand: BrandInfo): string {
  const subject = `Invoice ${data.invoiceNumber} — ${data.amountFormatted} due ${data.dueDate}`;
  const meta: Array<{ label: string; value: string }> = [];
  if (data.dueDate) meta.push({ label: "Pay by", value: data.dueDate });
  if (data.issuedOn) meta.push({ label: "Issued", value: data.issuedOn });
  if (data.projectName) meta.push({ label: "Project", value: data.projectName });
  if (data.referenceNumber) meta.push({ label: "Reference", value: data.referenceNumber });

  const body = `
    ${renderEyebrow("Invoice")}
    ${renderDisplayHeadline(`N° ${data.invoiceNumber}`)}
    ${renderHairline()}
    ${renderGreeting(data.recipientName ?? data.clientName)}
    <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:${ZINC_700};">
      Below is the summary of invoice <strong>${escape(data.invoiceNumber)}</strong>${data.projectName ? ` for <strong>${escape(data.projectName)}</strong>` : ""}. Full line items, taxes and payment instructions are in your portal.
    </p>
    ${renderAmountHero(data.amountFormatted, "Amount due")}
    ${meta.length ? renderMetaGrid(meta) : ""}
    ${data.paymentInstructions ? renderQuoteBlock(data.paymentInstructions) : ""}
    ${renderCta("View & pay invoice", data.portalUrl)}
    ${renderFooterNote(
      `Please settle by ${escape(data.dueDate)}. If anything looks off, reply to this email — we'd much rather fix a typo than chase a payment.`,
    )}
  `;

  return renderShell({
    subject,
    preheader: `Invoice ${data.invoiceNumber} for ${data.amountFormatted} is due ${data.dueDate}.`,
    documentTitle: `Invoice · ${data.invoiceNumber}`,
    bodyHtml: body,
    brand,
  });
}

export function renderOnboardingHtml(data: OnboardingEmailData, brand: BrandInfo): string {
  const subject = `Welcome to your ${brand.name} portal`;
  const features = [
    {
      label: "Projects",
      body: "Live status, milestones and the team shipping your work.",
    },
    {
      label: "Proposals",
      body: "Review scope and pricing in detail. Accept on the spot.",
    },
    {
      label: "Invoices",
      body: "Download PDFs, track payments, settle in one tap.",
    },
  ];

  const body = `
    ${renderEyebrow("Client portal · Welcome")}
    ${renderDisplayHeadline("A workspace built around your projects.")}
    ${renderHairline()}
    ${renderGreeting(data.recipientName ?? data.clientName)}
    <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:${ZINC_700};">
      ${escape(data.clientName)} now has a dedicated portal on our platform. No passwords to manage — every sign-in uses a one-tap link sent to this email. Tap the button below to sign in for the first time.
    </p>
    ${renderFeatureGrid(features)}
    ${renderCta("Open your portal", data.portalSignInUrl)}
    ${renderFooterNote(
      `This first sign-in link expires in ${data.linkTtlMinutes} minutes. If it has lapsed by the time you read this, request a fresh link from the portal sign-in page — same email, no setup required.`,
    )}
  `;

  return renderShell({
    subject,
    preheader: `Welcome to the ${brand.name} client portal. Your sign-in link is inside.`,
    documentTitle: "Client portal",
    bodyHtml: body,
    brand,
  });
}

export function renderProjectCompleteHtml(data: ProjectCompleteEmailData, brand: BrandInfo): string {
  const subject = `${data.projectName} — wrapped and delivered`;
  const stats: Array<{ label: string; value: string }> = [];
  if (data.duration) stats.push({ label: "Duration", value: data.duration });
  if (data.projectLead) {
    stats.push({
      label: "Project lead",
      value: data.projectLead + (data.projectLeadEmail ? ` · ${data.projectLeadEmail}` : ""),
    });
  }
  stats.push({ label: "Completed", value: data.completedOn });

  const body = `
    ${renderEyebrow("Project · Delivered")}
    ${renderDisplayHeadline(`${data.projectName} is complete.`)}
    ${renderHairline()}
    ${renderGreeting(data.recipientName ?? data.clientName)}
    <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:${ZINC_700};">
      Every milestone on this engagement is wrapped. Thank you for the trust and the collaboration — it was a pleasure shipping <strong>${escape(data.projectName)}</strong> with you. Final deliverables, files and the full project history will remain available in your portal.
    </p>
    ${renderStatsStrip(stats)}
    ${renderChecklist("What's next", [
      "Review and settle any open invoices in the portal.",
      "Reach out any time for tweaks, additions or a new engagement.",
      "If you have a minute — a short referral or testimonial means the world.",
    ])}
    ${renderCta("Open project workspace", data.portalUrl)}
    ${renderFooterNote(
      "If anything still needs attention before we close the books on this one, just reply — we'd rather hear it now than after the project is archived.",
    )}
  `;

  return renderShell({
    subject,
    preheader: `${data.projectName} is complete. Final deliverables are in your portal.`,
    documentTitle: `Project · ${data.projectName}`,
    bodyHtml: body,
    brand,
  });
}

// ── Generic transactional renderer (auth flows, password reset, etc.) ───

export interface GenericEmailData {
  /** Eyebrow line above the headline. */
  kicker?: string;
  /** Document type label shown in the masthead, e.g. "Portal · Sign in". */
  documentTitle?: string;
  /** H1 of the email. */
  headline: string;
  greeting?: string;
  /** Lead paragraph immediately under the headline. Multiline is honoured. */
  intro?: string;
  /** Optional inline code block — e.g. temporary password, token. */
  code?: { label: string; value: string };
  /** Single CTA. Pass null to omit. */
  cta?: { label: string; url: string } | null;
  /** Optional footer disclaimer/expiry notice. */
  footerNote?: string;
  /** Plain key:value rows rendered below the intro — used by legacy
   *  payloads with unknown fields. */
  extras?: Array<{ label: string; value: string }>;
}

export function renderGenericHtml(
  subject: string,
  data: GenericEmailData,
  brand: BrandInfo,
): string {
  const greeting = data.greeting ? renderGreeting(stripPrefix(data.greeting, "Hi ", ",")) : "";
  const body = `
    ${data.kicker ? renderEyebrow(data.kicker) : ""}
    <h1 class="headline" style="margin:0;font-size:24px;line-height:1.18;font-weight:800;letter-spacing:-0.015em;color:${ZINC_900};">${escape(data.headline)}</h1>
    ${renderHairline()}
    ${greeting}
    ${data.intro ? `<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${ZINC_700};">${escapeMultiline(data.intro)}</p>` : ""}
    ${data.code ? renderCodeBlock(data.code.label, data.code.value) : ""}
    ${data.extras && data.extras.length ? renderMetaGrid(data.extras) : ""}
    ${data.cta ? renderCta(data.cta.label, data.cta.url) : ""}
    ${data.footerNote ? renderFooterNote(data.footerNote) : ""}
  `;
  return renderShell({
    subject,
    preheader: data.intro ? stripTags(data.intro) : data.headline,
    documentTitle: data.documentTitle ?? brand.name,
    bodyHtml: body,
    brand,
  });
}

// ── Shell + shared building blocks ───────────────────────────────────────

// Colours: pure-black accent + neutral zinc grayscale. No accent colour
// is used anywhere on purpose — the brand reads "premium-monochrome",
// matching the proposal print template.
const BLACK = "#0a0a0a";
const ZINC_900 = "#18181b";
const ZINC_700 = "#3f3f46";
const ZINC_500 = "#71717a";
const ZINC_400 = "#a1a1aa";
const ZINC_300 = "#d4d4d8";
const ZINC_200 = "#e4e4e7";
const ZINC_100 = "#f4f4f5";
const ZINC_50 = "#fafafa";

const HEADER_LOGO_W = 112;
const HEADER_LOGO_H = 28;
const FOOTER_LOGO_W = 80;
const FOOTER_LOGO_H = 20;

interface ShellArgs {
  subject: string;
  preheader: string;
  documentTitle: string;
  bodyHtml: string;
  brand: BrandInfo;
}

function renderShell({ subject, preheader, documentTitle, bodyHtml, brand }: ShellArgs): string {
  const customLogoUrl = resolveLogoUrl(brand.logoUrl);
  const headerLogoSrc = `cid:${HEADER_LOGO_CID}`;
  const footerLogoSrc = customLogoUrl ?? `cid:${FOOTER_LOGO_CID}`;
  const contactStrip = [brand.website, brand.email, brand.phone]
    .filter(Boolean)
    .map((v) => escape(v as string))
    .join(`<span style="color:${ZINC_300};margin:0 8px;">&middot;</span>`);

  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escape(subject)}</title>
  <!--[if mso]>
  <xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
  <![endif]-->
  <style>
    u + #body a { color: inherit; text-decoration: none; }
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
    :root { color-scheme: light; supported-color-schemes: light; }
    img { -ms-interpolation-mode: bicubic; image-rendering: -webkit-optimize-contrast; }

    @media only screen and (max-width: 600px) {
      .email-card { width: 100% !important; max-width: 100% !important; border-left: 0 !important; border-right: 0 !important; }
      .masthead { padding: 14px 22px !important; }
      .body-pad { padding: 32px 22px 24px !important; }
      .footer-pad { padding: 18px 22px !important; }
      .legal-pad { padding: 14px 22px !important; }
      .display-headline { font-size: 26px !important; line-height: 1.15 !important; }
      .headline { font-size: 20px !important; line-height: 1.18 !important; }
      .amount-hero { font-size: 40px !important; }
      .stack { display: block !important; width: 100% !important; }
      .stack-right { text-align: left !important; padding-top: 6px !important; }
      .stat-cell { display: block !important; width: 100% !important; padding: 14px 0 !important; border-right: 0 !important; border-bottom: 1px solid ${ZINC_200} !important; }
      .stat-cell-last { border-bottom: 0 !important; }
      .feature-cell { display: block !important; width: 100% !important; padding: 18px 0 !important; border-right: 0 !important; border-bottom: 1px solid ${ZINC_200} !important; }
      .feature-cell-last { border-bottom: 0 !important; }
      .cta-link { padding: 16px 24px !important; font-size: 13px !important; display: block !important; text-align: center !important; }
    }
    @media only screen and (max-width: 380px) {
      .doc-title-cell { display: none !important; }
    }
  </style>
</head>
<body id="body" style="margin:0;padding:0;background-color:${ZINC_100};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${ZINC_900};-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div style="display:none;font-size:1px;color:${ZINC_100};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escape(preheader)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${ZINC_100};">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" class="email-card" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid ${ZINC_200};border-collapse:separate;">
          <!-- MASTHEAD -->
          <tr>
            <td class="masthead" bgcolor="${BLACK}" style="padding:18px 36px;background-color:${BLACK};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td class="stack" align="left" valign="middle" style="vertical-align:middle;">
                    <img src="${escape(headerLogoSrc)}" alt="${escape(brand.name)}" width="${HEADER_LOGO_W}" height="${HEADER_LOGO_H}" style="display:block;width:${HEADER_LOGO_W}px;height:${HEADER_LOGO_H}px;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;" />
                  </td>
                  <td class="stack stack-right doc-title-cell" align="right" valign="middle" style="vertical-align:middle;">
                    <span class="doc-title" style="font-size:10px;font-weight:700;letter-spacing:0.28em;text-transform:uppercase;color:${ZINC_400};">${escape(documentTitle.toUpperCase())}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr><td style="height:1px;background-color:${ZINC_300};line-height:1px;font-size:1px;">&nbsp;</td></tr>
          <tr><td style="height:3px;background-color:${BLACK};line-height:1px;font-size:1px;">&nbsp;</td></tr>

          <!-- BODY -->
          <tr>
            <td class="body-pad" style="padding:40px 44px 32px;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- FOOTER -->
          <tr><td style="height:1px;background-color:${ZINC_200};line-height:1px;font-size:1px;">&nbsp;</td></tr>
          <tr>
            <td class="footer-pad" style="padding:20px 36px;background-color:${ZINC_50};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td class="stack" align="left" valign="middle" style="vertical-align:middle;">
                    <img src="${escape(footerLogoSrc)}" alt="${escape(brand.name)}" width="${FOOTER_LOGO_W}" height="${FOOTER_LOGO_H}" style="display:block;width:${FOOTER_LOGO_W}px;height:${FOOTER_LOGO_H}px;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;" />
                  </td>
                  <td class="stack stack-right" align="right" valign="middle" style="vertical-align:middle;font-size:11px;color:${ZINC_500};">
                    ${contactStrip}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr><td style="height:3px;background-color:${BLACK};line-height:1px;font-size:1px;">&nbsp;</td></tr>
          <tr>
            <td class="legal-pad" style="padding:14px 36px;background-color:#ffffff;">
              <p style="margin:0;font-size:10px;line-height:1.6;color:${ZINC_400};">
                Sent by ${escape(brand.name)}${brand.addressLine1 ? `, ${escape(brand.addressLine1)}` : ""}${brand.city ? ` &middot; ${escape(brand.city)}` : ""}${brand.country ? `, ${escape(brand.country)}` : ""}. If this email arrived unexpectedly, you can safely disregard it.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Body primitives ──────────────────────────────────────────────────────

function renderEyebrow(text: string): string {
  return `<div class="eyebrow" style="font-size:11px;font-weight:700;letter-spacing:0.28em;text-transform:uppercase;color:${ZINC_500};margin:0 0 14px;">${escape(text)}</div>`;
}

function renderDisplayHeadline(text: string): string {
  // Larger display type for the document-specific headlines (project
  // name, invoice number, "Welcome…"). Tight letter-spacing and big
  // weight to read like a printed cover sheet.
  return `<h1 class="display-headline" style="margin:0;font-size:32px;line-height:1.1;font-weight:800;letter-spacing:-0.02em;color:${ZINC_900};">${escape(text)}</h1>`;
}

function renderRefLine(left: string, right: string | null): string {
  // Slim two-column reference line, shown just under the headline.
  // Used to display "N° 0042  ·  Prepared 23 May 2026" style metadata.
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:14px 0 0;">
    <tr>
      <td align="left" style="font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:${ZINC_500};">${escape(left)}</td>
      ${right ? `<td align="right" style="font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:${ZINC_500};">${escape(right)}</td>` : ""}
    </tr>
  </table>`;
}

function renderHairline(): string {
  // 3px black accent rule below the headline. Mirrors the proposal
  // print SectionRule but a touch heavier so it reads from a phone.
  return `<div style="height:3px;width:56px;background-color:${BLACK};margin:18px 0 26px;line-height:3px;font-size:1px;">&nbsp;</div>`;
}

function renderGreeting(name: string): string {
  const firstName = name.trim().split(/\s+/)[0] || name.trim();
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:${ZINC_900};font-weight:600;">Hi ${escape(firstName)},</p>`;
}

function renderStatsStrip(stats: Array<{ label: string; value: string }>): string {
  // Three-up (or two-up) stat strip with internal vertical dividers.
  // On mobile, cells collapse to a stacked list (see .stat-cell media
  // query). The strip has a subtle outer border so it reads as a card.
  if (!stats.length) return "";
  const cells = stats
    .map((s, i) => {
      const isLast = i === stats.length - 1;
      const dividerStyle = isLast ? "" : `border-right:1px solid ${ZINC_200};`;
      return `<td class="stat-cell ${isLast ? "stat-cell-last" : ""}" valign="top" style="padding:18px 20px;${dividerStyle};vertical-align:top;width:${Math.floor(100 / stats.length)}%;">
        <div style="font-size:10px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:${ZINC_500};margin-bottom:8px;">${escape(s.label)}</div>
        <div style="font-size:18px;font-weight:700;letter-spacing:-0.01em;color:${ZINC_900};line-height:1.25;">${escape(s.value)}</div>
      </td>`;
    })
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:6px 0 28px;border:1px solid ${ZINC_200};border-collapse:collapse;background-color:${ZINC_50};">
    <tr>${cells}</tr>
  </table>`;
}

function renderPreparedLine(client: string, preparedBy: string): string {
  // Two-column "Prepared for X · Prepared by Y" strip under the stats.
  // Reads like the title-page metadata of the proposal PDF.
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 28px;">
    <tr>
      <td align="left" valign="top" style="vertical-align:top;padding-right:16px;">
        <div style="font-size:10px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:${ZINC_500};margin-bottom:4px;">Prepared for</div>
        <div style="font-size:14px;font-weight:700;color:${ZINC_900};">${escape(client)}</div>
      </td>
      <td align="right" valign="top" style="vertical-align:top;">
        <div style="font-size:10px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:${ZINC_500};margin-bottom:4px;">Prepared by</div>
        <div style="font-size:14px;font-weight:700;color:${ZINC_900};">${escape(preparedBy)}</div>
      </td>
    </tr>
  </table>`;
}

function renderQuoteBlock(text: string): string {
  // Pull-quote style block — left-side black rule + slightly larger
  // italic-ish copy. Used for proposal summary lead, payment notes.
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 28px;">
    <tr>
      <td style="border-left:3px solid ${BLACK};padding:4px 0 4px 18px;">
        <p style="margin:0;font-size:15px;line-height:1.6;color:${ZINC_900};">${escapeMultiline(text)}</p>
      </td>
    </tr>
  </table>`;
}

function renderInclusionList(items: string[]): string {
  // Lightweight bullet list with arrow markers, capped at 6 items so
  // the email doesn't bloat. Anything beyond gets a "+ N more in the
  // portal" trailer line.
  if (!items.length) return "";
  const visible = items.slice(0, 6);
  const overflow = items.length - visible.length;
  const rows = visible
    .map(
      (it) => `<tr>
        <td valign="top" style="vertical-align:top;width:18px;padding:2px 10px 6px 0;color:${ZINC_400};font-size:13px;line-height:1.5;">&rsaquo;</td>
        <td valign="top" style="vertical-align:top;padding:0 0 6px;font-size:14px;line-height:1.55;color:${ZINC_900};">${escape(it)}</td>
      </tr>`,
    )
    .join("");
  const trailer = overflow > 0
    ? `<tr><td colspan="2" style="padding:6px 0 0;font-size:12px;color:${ZINC_500};font-style:italic;">+${overflow} more item${overflow === 1 ? "" : "s"} in the full proposal.</td></tr>`
    : "";
  return `<div style="margin:0 0 24px;">
    <div style="font-size:11px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:${ZINC_500};margin-bottom:10px;">What's included</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows}${trailer}</table>
  </div>`;
}

function renderAmountHero(amount: string, label: string): string {
  // Statement-style amount block: huge tabular figure, label below.
  // The single thing the recipient will look at — sized accordingly.
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:6px 0 22px;background-color:${BLACK};">
    <tr>
      <td style="padding:28px 32px;text-align:left;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.28em;text-transform:uppercase;color:${ZINC_400};margin-bottom:8px;">${escape(label)}</div>
        <div class="amount-hero" style="font-size:48px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;line-height:1.0;font-variant-numeric:tabular-nums;">${escape(amount)}</div>
      </td>
    </tr>
  </table>`;
}

function renderMetaGrid(items: Array<{ label: string; value: string }>): string {
  // 2-column meta grid for invoice / generic key:value pairs. Each row
  // has a label (uppercase tracking) and value (bold). Borders only
  // between rows for a quiet, professional grid.
  if (!items.length) return "";
  const rows = items
    .map((it, i) => {
      const isLast = i === items.length - 1;
      return `<tr>
        <td valign="top" style="vertical-align:top;padding:12px 16px 12px 0;${!isLast ? `border-bottom:1px solid ${ZINC_200};` : ""}width:38%;">
          <div style="font-size:10px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:${ZINC_500};">${escape(it.label)}</div>
        </td>
        <td valign="top" align="right" style="vertical-align:top;padding:12px 0;${!isLast ? `border-bottom:1px solid ${ZINC_200};` : ""}">
          <div style="font-size:14px;font-weight:600;color:${ZINC_900};">${escape(it.value)}</div>
        </td>
      </tr>`;
    })
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 26px;border-top:1px solid ${ZINC_200};">${rows}</table>`;
}

function renderFeatureGrid(items: Array<{ label: string; body: string }>): string {
  // Three-up feature grid for the onboarding email — each cell has a
  // numbered monogram (01/02/03) over a label and short body. Looks
  // like a magazine TOC, not a SaaS onboarding splash.
  if (!items.length) return "";
  const cells = items
    .map((it, i) => {
      const isLast = i === items.length - 1;
      const dividerStyle = isLast ? "" : `border-right:1px solid ${ZINC_200};`;
      return `<td class="feature-cell ${isLast ? "feature-cell-last" : ""}" valign="top" style="padding:22px 20px;${dividerStyle};vertical-align:top;width:${Math.floor(100 / items.length)}%;">
        <div style="font-size:20px;font-weight:800;color:${ZINC_300};letter-spacing:-0.02em;line-height:1;margin-bottom:10px;font-variant-numeric:tabular-nums;">${String(i + 1).padStart(2, "0")}</div>
        <div style="font-size:13px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${ZINC_900};margin-bottom:6px;">${escape(it.label)}</div>
        <div style="font-size:13px;line-height:1.55;color:${ZINC_700};">${escape(it.body)}</div>
      </td>`;
    })
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 28px;border:1px solid ${ZINC_200};border-collapse:collapse;background-color:${ZINC_50};">
    <tr>${cells}</tr>
  </table>`;
}

function renderChecklist(title: string, items: string[]): string {
  // Small uppercase title + dash-bulleted list. Used for the project-
  // complete "what's next" block.
  const rows = items
    .map(
      (it) => `<tr>
        <td valign="top" style="vertical-align:top;width:18px;padding:2px 10px 8px 0;color:${ZINC_400};font-size:13px;line-height:1.5;">&mdash;</td>
        <td valign="top" style="vertical-align:top;padding:0 0 8px;font-size:14px;line-height:1.55;color:${ZINC_900};">${escape(it)}</td>
      </tr>`,
    )
    .join("");
  return `<div style="margin:0 0 26px;">
    <div style="font-size:11px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:${ZINC_500};margin-bottom:10px;">${escape(title)}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows}</table>
  </div>`;
}

function renderCta(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 6px;">
    <tr>
      <td bgcolor="${BLACK}" style="border-radius:2px;">
        <a href="${escape(url)}" target="_blank" rel="noopener" class="cta-link" style="display:inline-block;padding:15px 30px;font-size:13px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#ffffff;text-decoration:none;background-color:${BLACK};border:1px solid ${BLACK};border-radius:2px;mso-padding-alt:0;">${escape(label)} &rarr;</a>
      </td>
    </tr>
  </table>
  <p style="margin:8px 0 0;font-size:11px;line-height:1.5;color:${ZINC_500};word-break:break-all;">${escape(url)}</p>`;
}

function renderFooterNote(html: string): string {
  return `<p style="margin:28px 0 0;font-size:12px;line-height:1.6;color:${ZINC_500};">${escapeMultiline(html)}</p>`;
}

function renderCodeBlock(label: string, value: string): string {
  return `<div style="margin:0 0 24px;">
    <div style="font-size:10px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:${ZINC_500};margin-bottom:8px;">${escape(label)}</div>
    <code style="display:inline-block;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:15px;font-weight:600;background-color:${ZINC_100};border:1px solid ${ZINC_200};padding:10px 14px;border-radius:2px;color:${ZINC_900};letter-spacing:0.06em;">${escape(value)}</code>
  </div>`;
}

// ── Plain-text rendering (one fallback for every kind) ──────────────────

export function renderProposalText(data: ProposalEmailData, brand: BrandInfo): string {
  const eyebrow = data.variant === "resent" ? "PROPOSAL · UPDATED" : "PROPOSAL";
  const lines = [
    eyebrow,
    data.projectName.toUpperCase(),
    "─".repeat(40),
    data.proposalNumber ? `N° ${data.proposalNumber}` : "",
    `Prepared for ${data.clientName}`,
    "",
    data.summary ?? "",
    "",
    data.investment ? `Investment: ${data.investment}` : "",
    data.timeline ? `Timeline:   ${data.timeline}` : "",
    data.validUntil ? `Valid until: ${data.validUntil}` : "",
    "",
    `View proposal: ${data.portalUrl}`,
    "",
    "—",
    brand.name,
    [brand.website, brand.email].filter(Boolean).join(" · "),
  ].filter((l) => l !== "");
  return lines.join("\n");
}

export function renderInvoiceText(data: InvoiceEmailData, brand: BrandInfo): string {
  const lines = [
    "INVOICE",
    data.invoiceNumber,
    "─".repeat(40),
    `Amount due: ${data.amountFormatted}`,
    `Pay by:     ${data.dueDate}`,
    data.issuedOn ? `Issued:     ${data.issuedOn}` : "",
    data.projectName ? `Project:    ${data.projectName}` : "",
    data.referenceNumber ? `Reference:  ${data.referenceNumber}` : "",
    "",
    `View & pay: ${data.portalUrl}`,
    "",
    "—",
    brand.name,
    [brand.website, brand.email].filter(Boolean).join(" · "),
  ].filter((l) => l !== "");
  return lines.join("\n");
}

export function renderOnboardingText(data: OnboardingEmailData, brand: BrandInfo): string {
  return [
    "CLIENT PORTAL · WELCOME",
    "─".repeat(40),
    `Welcome to your ${brand.name} client portal, ${data.clientName}.`,
    "",
    "Inside you can track projects, review and accept proposals, and",
    "settle invoices — all in one place.",
    "",
    `Open your portal: ${data.portalSignInUrl}`,
    "",
    `(This first sign-in link expires in ${data.linkTtlMinutes} minutes.)`,
    "",
    "—",
    brand.name,
    [brand.website, brand.email].filter(Boolean).join(" · "),
  ].filter((l) => l !== "").join("\n");
}

export function renderProjectCompleteText(data: ProjectCompleteEmailData, brand: BrandInfo): string {
  return [
    "PROJECT · DELIVERED",
    `${data.projectName} is complete`,
    "─".repeat(40),
    data.duration ? `Duration:     ${data.duration}` : "",
    data.projectLead ? `Project lead: ${data.projectLead}${data.projectLeadEmail ? ` (${data.projectLeadEmail})` : ""}` : "",
    `Completed:    ${data.completedOn}`,
    "",
    "Thank you for the trust and the collaboration. Final deliverables",
    "and the full project history remain available in your portal.",
    "",
    `Open project workspace: ${data.portalUrl}`,
    "",
    "—",
    brand.name,
    [brand.website, brand.email].filter(Boolean).join(" · "),
  ].filter((l) => l !== "").join("\n");
}

export function renderGenericText(
  subject: string,
  data: GenericEmailData,
  brand: BrandInfo,
): string {
  const lines: string[] = [];
  if (data.kicker) lines.push(data.kicker.toUpperCase(), "");
  lines.push(data.headline);
  lines.push("─".repeat(Math.min(40, data.headline.length)));
  if (data.greeting) lines.push("", data.greeting);
  if (data.intro) lines.push("", data.intro);
  if (data.code) lines.push("", `${data.code.label}: ${data.code.value}`);
  if (data.extras) {
    for (const e of data.extras) lines.push(`${e.label}: ${e.value}`);
  }
  if (data.cta) lines.push("", `${data.cta.label}:`, data.cta.url);
  if (data.footerNote) lines.push("", data.footerNote);
  lines.push("", "—", brand.name, [brand.website, brand.email].filter(Boolean).join(" · "));
  return lines.join("\n");
}

// ── Utilities ────────────────────────────────────────────────────────────

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeMultiline(s: string): string {
  return escape(s).replace(/\r?\n/g, "<br/>");
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function stripPrefix(s: string, pfx: string, sfx: string): string {
  let out = s;
  if (out.startsWith(pfx)) out = out.slice(pfx.length);
  if (out.endsWith(sfx)) out = out.slice(0, -sfx.length);
  return out;
}

function resolveLogoUrl(raw: string | null): string | null {
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = env.appUrl.replace(/\/$/, "");
  return raw.startsWith("/") ? `${base}${raw}` : `${base}/${raw}`;
}
