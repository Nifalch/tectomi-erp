"use client";

import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const LOGO_DARK_SRC = "/logo-white.png"; // black wordmark on transparent (1584×396)
const LOGO_LIGHT_SRC = "/logo-white-inverted.png"; // white wordmark on transparent (800×200)

/* ──────────────────────────────────────────────────────────────────────────
   Logo — paints the actual Nuro 7 brand asset into a <canvas>.

   Why a <canvas> instead of <img>?  html2canvas-pro clones the print DOM
   into a fresh iframe per page-capture; cloned <img> elements have to
   re-decode their bitmap, and on some pages the snapshot fires before the
   decode finishes — producing a blank rectangle. For <canvas> nodes
   html2canvas-pro instead uses putImageData to copy the existing pixel
   data into the clone synchronously (see node_modules/html2canvas-pro/
   dist/lib/dom/document-cloner.js, createCanvasClone). That sidesteps the
   decode race entirely.
   ────────────────────────────────────────────────────────────────────────── */
function Logo({
  src,
  alt,
  tone = "dark",
  height = 36,
}: {
  src?: string;
  alt: string;
  tone?: "dark" | "light"; // dark surface (white bg) vs light surface (black bg)
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const isExternal = !!src && !src.startsWith("/") && !failed;
  const bundledSrc = tone === "light" ? LOGO_LIGHT_SRC : LOGO_DARK_SRC;
  const finalSrc = isExternal ? (src as string) : bundledSrc;

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const img = new Image();
    if (!finalSrc.startsWith("/") && !finalSrc.startsWith("data:")) {
      img.crossOrigin = "anonymous";
    }
    const onload = async () => {
      if (cancelled) return;
      try { await img.decode(); } catch { /* fall through */ }
      if (cancelled) return;
      const aspect = img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 4;
      const dpr = 3; // hi-DPI raster so the canvas survives PDF scale=3 cleanly
      canvas.width = Math.round(height * aspect * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${Math.round(height * aspect)}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.dataset.painted = "1";
    };
    img.onload = () => void onload();
    img.onerror = () => { if (!cancelled) setFailed(true); };
    img.src = finalSrc;
    return () => { cancelled = true; };
  }, [finalSrc, height]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={alt}
      data-logo-src={finalSrc}
      data-logo-height={height}
      style={{
        height: `${height}px`,
        // Sensible default width so the canvas occupies space before the
        // image finishes loading. Both bundled assets are ≈4:1, so we
        // pre-allocate 4× the height; the useEffect resets to the exact
        // aspect ratio after decode.
        width: `${height * 4}px`,
        display: "block",
      }}
    />
  );
}

export interface NuroProposalBlock {
  heading?: string;
  content?: string;
  durationWeeks?: number | null;
  sortOrder?: number;
}

export interface NuroProposalDeliverable {
  kind: "INCLUDED" | "EXCLUDED" | string;
  title: string;
  description?: string;
  amount?: number | string | null;
  sortOrder?: number;
}

export interface NuroProposalData {
  id: string;
  projectName?: string;
  status?: string;
  createdAt?: string;
  validUntil?: string | null;
  clientName?: string;
  clientEmail?: string;
  clientAddress?: string;
  preparedBy?: string;
  description?: string;
  projectUnderstanding?: string | null;
  timeline?: string;
  pricing?: string;
  paymentTermsText?: string | null;
  blocks?: NuroProposalBlock[];
  deliverables?: NuroProposalDeliverable[];
  acceptance?: {
    decision: "ACCEPTED" | "REJECTED";
    decidedAt: string;
    note?: string | null;
    ip?: string;
    contact?: { name?: string | null; email?: string | null } | null;
  } | null;
}

export interface NuroOrgInfo {
  name?: string;
  legalName?: string;
  logoUrl?: string;
  email?: string;
  phone?: string;
  website?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  invoiceTerms?: string;
  proposalTerms?: string;
  aboutCompany?: string;
  ceoName?: string;
  ceoTitle?: string;
}

const A4_W = "794px";
const A4_H = "1123px";
const PAD_X = "px-12";
const BLACK = "#0a0a0a";

/**
 * Does this string look like a polished consultant paragraph we can
 * print to a client? Returns false for raw user scribbles like
 * "basic shopify store", "fix the checkout pls", "asap", etc.
 *
 * Matches the API-side gate in projects.service.ts. This frontend
 * duplicate exists so that proposals saved BEFORE that gate landed
 * (and still have a raw brief in `description`) don't render the
 * scribble verbatim on the cover and Executive Summary pages.
 */
function looksProfessional(text: string | null | undefined): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length < 60) return false;
  if (!/[.!?]/.test(trimmed)) return false;
  const capitalised = trimmed.match(/(^|\s)[A-Z][a-z]/g) ?? [];
  return capitalised.length >= 2;
}

/* ──────────────────────────────────────────────────────────────────────────
   Page wrapper
   - Cover: no header bar
   - Internal pages: black header strip + footer with brand contact strip
   ────────────────────────────────────────────────────────────────────────── */
function Page({
  children,
  isCover = false,
  pageNumber,
  totalPages,
  org,
  doc,
  documentTitle,
}: {
  children: React.ReactNode;
  isCover?: boolean;
  pageNumber?: number;
  totalPages?: number;
  org?: NuroOrgInfo;
  doc?: NuroProposalData;
  documentTitle?: string;
}) {
  const clientShort = (doc?.clientName ?? "").toUpperCase().split(/\s+/)[0] || "";
  const headerLogoSrc = org?.logoUrl;

  return (
    <section
      className="nuro-page relative mx-auto flex flex-col bg-white text-zinc-900 shadow-sm print:shadow-none"
      style={{ width: A4_W, minHeight: A4_H }}
    >
      {/* ── HEADER ──
          Refined masthead. Three zones with clear hierarchy:
            • Left  — logo + slim divider + bold project title
            • Center (subtle) — client micro-line below title
            • Right — page indicator with the current page typeset large,
                      "OF NN" beneath in muted caps
          Bottom finish: a 1px white hairline + a 2px brand rule below the bar. */}
      {!isCover && (
        <header className="shrink-0">
          <div
            className={`flex items-center justify-between ${PAD_X} py-3`}
            style={{ backgroundColor: BLACK }}
          >
            {/* Logo + project / client stack */}
            <div className="flex items-center gap-4">
              <Logo src={headerLogoSrc} alt={org?.name ?? "Tectomi ERP"} tone="light" height={22} />
              <span className="h-7 w-px bg-zinc-700" aria-hidden />
              <div className="flex flex-col leading-tight">
                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-white">
                  {documentTitle ?? "Proposal"}
                </span>
                {clientShort && (
                  <span className="mt-0.5 text-[9px] uppercase tracking-[0.22em] text-zinc-500">
                    Prepared for {clientShort}
                  </span>
                )}
              </div>
            </div>

            {/* Page indicator — current page large, total beneath */}
            <div className="flex items-baseline gap-2.5 text-zinc-500">
              <span className="text-[9px] font-bold uppercase tracking-[0.28em]">Page</span>
              <span className="text-[18px] font-extrabold leading-none tabular-nums tracking-[-0.02em] text-white">
                {String(pageNumber).padStart(2, "0")}
              </span>
              <span className="text-[9px] font-bold uppercase tracking-[0.22em]">
                / {String(totalPages).padStart(2, "0")}
              </span>
            </div>
          </div>
          {/* Two-line bottom finish: hairline white separator + thin black brand rule */}
          <div className="h-[1px] w-full bg-zinc-300" />
          <div className="h-[2px] w-full" style={{ backgroundColor: BLACK }} />
        </header>
      )}

      {/* Content */}
      <div className="flex flex-1 flex-col">{children}</div>

      {/* ── FOOTER ──
          Light hairline + black bottom rule, contact info aligned in two rails.
          Logo speaks for itself — no redundant "NURO 7" text wordmark. */}
      {!isCover && (
        <footer className="mt-auto shrink-0">
          <div className="h-[2px] w-full bg-zinc-200" />
          <div
            className={`flex items-center justify-between ${PAD_X} py-2.5 text-[10px] tracking-wide text-zinc-500`}
          >
            {/* Left rail — brand mark only */}
            <div className="flex items-center gap-3">
              <Logo src={headerLogoSrc} alt={org?.name ?? "Tectomi ERP"} tone="dark" height={14} />
            </div>
            {/* Right rail — contact */}
            <div className="flex items-center gap-2">
              {org?.website && <span className="text-zinc-700">{org.website}</span>}
              {org?.website && org?.email && <span className="text-zinc-300">·</span>}
              {org?.email && <span className="text-zinc-700">{org.email}</span>}
            </div>
          </div>
          <div className="h-[2px] w-full" style={{ backgroundColor: BLACK }} />
        </footer>
      )}
    </section>
  );
}

/* Section header — light-gray number + bold title + subtitle + black rule.
   Tightened: number 72 → 56px, title 26 → 22px, less vertical mass. */
function SectionHead({ number, title, subtitle }: { number: string; title: string; subtitle?: string }) {
  return (
    <div className="flex items-end gap-5">
      <div className="text-[56px] font-bold leading-[0.85] tracking-[-0.04em] text-zinc-200 tabular-nums">{number}</div>
      <div className="flex-1 pb-1">
        <h2 className="text-[22px] font-bold leading-tight tracking-[-0.01em] text-zinc-900 uppercase">
          {title}
        </h2>
        {subtitle && <div className="mt-0.5 text-[12px] text-zinc-500">{subtitle}</div>}
      </div>
    </div>
  );
}

/* Black accent rule below SectionHead — slimmer */
function SectionRule() {
  return <div className="mt-1 h-[2px] w-full" style={{ backgroundColor: BLACK }} />;
}

/* Phase / category band — black header + light tinted body rows of bullets */
function Band({
  title,
  items,
}: {
  title: string;
  items: { text: string }[];
}) {
  return (
    <div className="overflow-hidden border border-zinc-200">
      <div
        className={`${PAD_X} py-2.5 text-[12px] font-bold uppercase tracking-[0.16em] text-white`}
        style={{ backgroundColor: BLACK }}
      >
        {title}
      </div>
      <ul className="divide-y divide-zinc-100 bg-zinc-50/60">
        {items.map((it, i) => (
          <li key={i} className={`${PAD_X} py-2 text-[13px] leading-relaxed text-zinc-800`}>
            <span className="mr-2 text-zinc-500">▸</span>
            {it.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function NuroProposalPrint({ doc, org }: { doc: NuroProposalData; org?: NuroOrgInfo }) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const downloadPdf = async () => {
    if (!sheetRef.current || downloading) return;
    setDownloading(true);
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas-pro"),
        import("jspdf"),
      ]);

      // Paint every brand-logo <canvas> before capture. The Logo component
      // paints on mount, but if the user clicks Download faster than the
      // first image decodes, the canvases would be blank. This loop is a
      // safety net: it (re)paints any unpainted canvas synchronously.
      const logoCanvases = Array.from(
        sheetRef.current.querySelectorAll<HTMLCanvasElement>("canvas[data-logo-src]"),
      );
      const ensurePainted = async (canvas: HTMLCanvasElement) => {
        // The Logo component sets data-painted="1" once it has drawn pixels.
        // (canvas.width/height default to 300×150 even when blank, so they
        // can't be used as a "has been painted" probe.)
        if (canvas.dataset.painted === "1") return;
        const src = canvas.dataset.logoSrc;
        const height = Number(canvas.dataset.logoHeight ?? 30);
        if (!src) return;
        const img = new Image();
        if (!src.startsWith("/") && !src.startsWith("data:")) {
          img.crossOrigin = "anonymous";
        }
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = src;
        });
        try { await img.decode(); } catch { /* fall through */ }
        if (!img.naturalWidth) return;
        const aspect = img.naturalWidth / img.naturalHeight;
        const dpr = 3;
        canvas.width = Math.round(height * aspect * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = `${Math.round(height * aspect)}px`;
        canvas.style.height = `${height}px`;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.dataset.painted = "1";
      };
      await Promise.all(logoCanvases.map(ensurePainted));

      const pages = sheetRef.current.querySelectorAll<HTMLElement>(".nuro-page");
      const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      let isFirst = true;
      // A trailing slice this short is almost certainly the footer rule
      // + a few pixels of whitespace that "leaked" past the A4 boundary.
      // Emitting it produces the blank pages with a black line at top
      // that we used to ship — fold the overflow into the previous
      // slice instead by simply not creating a new PDF page for it.
      const TRAILING_SLICE_MIN_PT = 60;
      // Render-tolerance: if a page is taller than A4 by only this much,
      // squash it onto a single PDF page rather than slicing. Eliminates
      // 1-3 px overflows that otherwise create a near-empty second page.
      const SINGLE_PAGE_SLACK_PT = 28;
      for (let i = 0; i < pages.length; i++) {
        const node = pages[i];
        // eslint-disable-next-line no-await-in-loop
        const canvas = await html2canvas(node, {
          scale: 3,
          backgroundColor: "#ffffff",
          useCORS: true,
          allowTaint: false,
          logging: false,
          imageTimeout: 0,
          letterRendering: true,
        } as Parameters<typeof html2canvas>[1]);
        const scale = pageW / canvas.width;
        const totalH = canvas.height * scale;
        if (totalH <= pageH + SINGLE_PAGE_SLACK_PT) {
          if (!isFirst) pdf.addPage();
          isFirst = false;
          // Clamp render height to A4 so a tiny overflow doesn't
          // visually escape the page boundary.
          pdf.addImage(
            canvas.toDataURL("image/jpeg", 0.95),
            "JPEG",
            0,
            0,
            pageW,
            Math.min(totalH, pageH),
            undefined,
            "FAST",
          );
        } else {
          const sliceHeightPx = Math.floor(pageH / scale);
          let yOffset = 0;
          while (yOffset < canvas.height) {
            const remainingPx = canvas.height - yOffset;
            const thisSlicePx = Math.min(sliceHeightPx, remainingPx);
            const renderedPt = thisSlicePx * scale;
            // Drop a trailing tail-slice that's just the footer / whitespace.
            // If this is the LAST slice and it would render shorter than
            // TRAILING_SLICE_MIN_PT, skip it — its contents are negligible
            // and we'd otherwise get a blank PDF page.
            const isLastSlice = remainingPx <= sliceHeightPx;
            if (isLastSlice && renderedPt < TRAILING_SLICE_MIN_PT) break;

            const sliceCanvas = document.createElement("canvas");
            sliceCanvas.width = canvas.width;
            sliceCanvas.height = thisSlicePx;
            const ctx = sliceCanvas.getContext("2d");
            if (ctx) {
              ctx.fillStyle = "#ffffff";
              ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
              ctx.drawImage(canvas, 0, yOffset, canvas.width, sliceCanvas.height, 0, 0, sliceCanvas.width, sliceCanvas.height);
            }
            if (!isFirst) pdf.addPage();
            isFirst = false;
            pdf.addImage(sliceCanvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, pageW, renderedPt, undefined, "FAST");
            yOffset += sliceHeightPx;
          }
        }
      }
      pdf.save(`Proposal-${doc.projectName || doc.id || "draft"}.pdf`);
    } finally {
      setDownloading(false);
    }
  };

  // ── Derived data ──
  const orgName = org?.name ?? "Tectomi ERP";
  const orgEmail = org?.email ?? "";
  const orgPhone = org?.phone ?? "";
  const orgWebsite = org?.website ?? "";
  const logo = org?.logoUrl;
  const documentTitle = doc.projectName ? doc.projectName.toUpperCase() : "PROJECT PROPOSAL";

  const blocks = (doc.blocks ?? []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const deliverables = (doc.deliverables ?? []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const included = deliverables.filter((d) => d.kind === "INCLUDED");
  const excluded = deliverables.filter((d) => d.kind === "EXCLUDED");
  const pricedItems = included.filter((d) => d.amount != null && Number(d.amount) > 0);
  const pricingSubtotal = pricedItems.reduce((s, d) => s + Number(d.amount ?? 0), 0);
  const phaseSequence = blocks.filter((b) => b.durationWeeks != null && Number(b.durationWeeks) > 0);
  const totalWeeks = phaseSequence.reduce((s, b) => s + Number(b.durationWeeks ?? 0), 0);

  // Proposals show the protective proposalTerms (scope freeze, change requests,
  // IP, warranty, etc.). Fall back to invoiceTerms only if proposalTerms is unset.
  const stdTerms = (org?.proposalTerms ?? org?.invoiceTerms ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const termSections = stdTerms.map((line, idx) => {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0 && colonIdx < 60) {
      return { idx: idx + 1, heading: line.slice(0, colonIdx).trim(), body: line.slice(colonIdx + 1).trim() };
    }
    return { idx: idx + 1, heading: `Clause ${idx + 1}`, body: line };
  });

  // Paginate T&C clauses so each A4 page holds a fixed number — avoids the
  // PDF slicer cutting a clause in half across pages. First page is shorter
  // because it carries the Plain-English summary card; subsequent pages are
  // pure clause lists and can hold more.
  const TERMS_FIRST_PAGE = 6;
  const TERMS_REST_PAGE = 9;
  const termPages: typeof termSections[] = [];
  if (termSections.length > 0) {
    termPages.push(termSections.slice(0, TERMS_FIRST_PAGE));
    let cursor = TERMS_FIRST_PAGE;
    while (cursor < termSections.length) {
      termPages.push(termSections.slice(cursor, cursor + TERMS_REST_PAGE));
      cursor += TERMS_REST_PAGE;
    }
  }

  const showOverview = !!doc.description || !!doc.projectUnderstanding;
  const showScope = blocks.length > 0;
  const showDeliverables = deliverables.length > 0;
  const showPricing = pricedItems.length > 0;
  const showTimeline = !!doc.timeline || phaseSequence.length > 0;
  const showInvestment = !!(doc.pricing || doc.paymentTermsText);
  const showTerms = stdTerms.length > 0;

  // ── A4 pagination chunks ──
  // Each .nuro-page captures at A4 height (~1123px). When a section's
  // content overflows, the html2canvas slicer breaks at arbitrary pixel
  // boundaries — splitting a phase mid-bullet, or a pricing row in half,
  // or worse: emitting a near-empty trailing page where only the
  // footer rules show. To avoid that, we pre-split the variable-length
  // sections into multiple pages whose content is guaranteed to fit.
  //
  // Numbers below are CONSERVATIVE — they err on the side of using an
  // extra page over leaking content off the bottom of A4. Each row's
  // real rendered height (including line-height + dividers) is closer
  // to 36–40px for scope/deliverables and 70–80px for pricing rows
  // with descriptions. Multiply by N and add ~250px of section chrome
  // (head + rule + intro + footer) — that needs to stay under 1123px.
  //
  //   Scope:    2 phases @ ~280px (incl. acceptance line) = 560 + 280 head = 840 ✓
  //   Deliverables: 6 items/col @ ~95px = 570 + 280 head = 850 ✓
  //   Pricing:  8 rows @ ~75px = 600 + 290 head/foot = 890 ✓
  const SCOPE_PHASES_PER_PAGE = 2;
  const DELIVERABLES_PER_COL_PER_PAGE = 6;
  const PRICING_ROWS_PER_PAGE = 8;

  const chunkArray = <T,>(arr: T[], size: number): T[][] => {
    if (size <= 0) return [arr];
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  const scopeChunks = showScope ? chunkArray(blocks, SCOPE_PHASES_PER_PAGE) : [];
  // Pair up included/excluded so the same page shows the matching slice
  // of both columns — keeps the visual symmetry of the 2-col layout.
  const includedChunks = chunkArray(included, DELIVERABLES_PER_COL_PER_PAGE);
  const excludedChunks = chunkArray(excluded, DELIVERABLES_PER_COL_PER_PAGE);
  const deliverableChunkCount = showDeliverables
    ? Math.max(includedChunks.length, excludedChunks.length, 1)
    : 0;
  const pricingChunks = showPricing
    ? chunkArray(pricedItems, PRICING_ROWS_PER_PAGE)
    : [];

  // ── Page numbering ──
  // Order matches buyer journey: trust → understanding → confidence → desire → action.
  // Cover → CONTENTS → Letter → ExecSum → WHY US → Scope → APPROACH → Deliverables →
  //   Timeline → Pricing → Investment → Terms → Accept
  let pageCount = 1; // cover
  pageCount++;       // contents (always)
  pageCount++;       // cover letter
  if (showOverview) pageCount++;        // executive summary
  pageCount++;                          // why us (always)
  if (showScope) pageCount += scopeChunks.length;          // scope can span multiple A4 pages
  pageCount++;                          // our approach (always)
  if (showDeliverables) pageCount += deliverableChunkCount; // deliverables can span multiple A4 pages
  if (showTimeline) pageCount++;        // moved up before pricing — buyers want "when" before "how much"
  if (showPricing) pageCount += pricingChunks.length;       // pricing table can span multiple A4 pages
  if (showInvestment) pageCount++;
  if (showTerms) pageCount += termPages.length;
  pageCount++; // acceptance/next steps

  // Section count = pageCount minus the cover and contents pages (those aren't
  // listed in the contents). Keeps the "X sections" label honest.
  const sectionCount = pageCount - 2;
  let pIdx = 1;
  const next = () => ++pIdx;
  let secIdx = 0;
  const secNum = () => String(++secIdx).padStart(2, "0");

  // ── Cover formatting ──
  const formattedDate = doc.createdAt
    ? new Date(doc.createdAt).toLocaleDateString("en-GB", { month: "long", year: "numeric" })
    : "";
  const formattedFullDate = doc.createdAt
    ? new Date(doc.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
    : "";
  // Fall back to "issue date + 30 days" when validUntil isn't set, so the cover
  // never shows "Open" (which kills urgency for the buyer).
  const validUntilDate = doc.validUntil
    ? new Date(doc.validUntil)
    : doc.createdAt
    ? new Date(new Date(doc.createdAt).getTime() + 30 * 86400000)
    : null;
  const formattedValid = validUntilDate
    ? validUntilDate.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
    : "";

  // ── Proposal reference ID ──
  // Brand-aligned identifier: N7-YY-NNN (e.g. N7-26-001).
  //   N7  → Nuro7 brand prefix
  //   YY  → last two digits of creation year (26 = 2026)
  //   NNN → 3-digit number deterministically derived from the database id
  // Stable per proposal — the same id always produces the same reference.
  const proposalRefId = (() => {
    const yr = doc.createdAt
      ? new Date(doc.createdAt).getFullYear()
      : new Date().getFullYear();
    const yr2 = String(yr).slice(-2);
    const cleanId = (doc.id ?? "").replace(/-/g, "");
    const num = cleanId
      ? parseInt(cleanId.slice(0, 6), 16) % 1000
      : 0;
    const nnn = String(num).padStart(3, "0");
    return `N7-${yr2}-${nnn}`;
  })();
  const statusLabel = (() => {
    const s = (doc.status ?? "DRAFT").toUpperCase();
    if (s === "DRAFT") return "Draft";
    if (s === "SENT") return "Sent — Awaiting review";
    if (s === "ACCEPTED") return "Accepted";
    if (s === "REJECTED") return "Rejected";
    if (s === "EXPIRED") return "Expired";
    return s;
  })();

  // Title splitting for the cover.
  // Many real project names contain a separator like "— Bmado" or "for Acme" that
  // names the client. We split *at* that separator so the client name becomes a
  // proper subhead, never a stranded "— BMADO" leading-dash line.
  const rawTitle = (doc.projectName ?? "Project Proposal").trim();
  const sepMatch = rawTitle.match(/\s*[—–\-:]\s+(.+)$/);
  let titleMain: string;
  let titleSub: string | null = null;
  if (sepMatch) {
    titleMain = rawTitle.slice(0, sepMatch.index!).trim();
    titleSub = sepMatch[1].trim();
  } else {
    titleMain = rawTitle;
  }
  // Stack the main title across up to two lines if it's long. Never start a
  // line with a stray separator character.
  const mainWords = titleMain.split(/\s+/).filter(Boolean);
  const splitAt = mainWords.length > 2 ? Math.ceil(mainWords.length / 2) : mainWords.length;
  const titleLine1 = mainWords.slice(0, splitAt).join(" ").toUpperCase();
  const titleLine2 = mainWords.length > splitAt ? mainWords.slice(splitAt).join(" ").toUpperCase() : "";

  return (
    <>
      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 0; }
          nav, aside, header.app-header, .no-print { display: none !important; }
          html, body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .nuro-print { margin: 0 !important; box-shadow: none !important; padding: 0 !important; }
          .nuro-page { box-shadow: none !important; page-break-after: always; break-after: page; }
          .nuro-page:last-child { page-break-after: auto; break-after: auto; }
        }
        .nuro-page + .nuro-page { margin-top: 24px; }
      `}</style>

      {/* Toolbar — Download PDF is the only export path. */}
      <div className="no-print mx-auto mt-4 flex max-w-[860px] items-center justify-end gap-2 px-2 print:hidden">
        <button
          type="button"
          onClick={downloadPdf}
          disabled={downloading}
          className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          <Download className="size-4" />
          {downloading ? "Generating PDF…" : "Download PDF"}
        </button>
      </div>

      <div ref={sheetRef} className="nuro-print mx-auto bg-zinc-100 py-6 print:py-0">

        {/* ════════════════════════════════════════════
            COVER · 3-zone sandwich (white / black hero / white)
            • TOP WHITE   → brand identity (logo + meta)
            • MIDDLE BLACK → hero band — title on dark, gets all the visual weight
            • BOTTOM WHITE → tagline + data + meta + CTA on clean white
            Balanced black/white mix, distinctive, modern but not all-dark.
            ════════════════════════════════════════════ */}
        <Page isCover>
          <div className="flex flex-1 flex-col bg-white">

            {/* ═══ TOP WHITE — brand row ═══ */}
            <div className={`shrink-0 flex items-center justify-between ${PAD_X} pt-10 pb-6`}>
              <Logo src={logo} alt={orgName} tone="dark" height={30} />
              <div className="text-right">
                <div className="text-[9px] font-bold uppercase tracking-[0.32em] text-zinc-500">
                  Confidential Proposal
                </div>
                <div className="mt-1 text-[13px] font-bold tracking-[0.04em] tabular-nums text-zinc-900">
                  {formattedFullDate || formattedDate || "—"}
                </div>
                <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.18em] tabular-nums text-zinc-500">
                  Ref · {proposalRefId}
                </div>
              </div>
            </div>

            {/* ═══ MIDDLE BLACK — hero band ═══
                Takes the visual centre of the page. Title in white pops against
                the dark, kicker and tagline ride below in muted gray. */}
            <div
              className={`relative flex flex-1 flex-col justify-center ${PAD_X} text-white`}
              style={{ backgroundColor: BLACK, paddingTop: 56, paddingBottom: 56 }}
            >
              <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-zinc-400">
                Prepared for{" "}
                <span className="text-white">{doc.clientName ?? "Client"}</span>
              </div>

              <h1 className="mt-6 font-extrabold uppercase leading-[0.88] tracking-[-0.04em] text-white">
                <span className="block text-[68px]">{titleLine1}</span>
                {titleLine2 && <span className="block text-[68px]">{titleLine2}</span>}
              </h1>

              {titleSub && (
                <div className="mt-3 text-[22px] font-semibold tracking-[-0.005em] text-zinc-500">
                  for {titleSub}
                </div>
              )}

              {/* Cover tagline — cut at the FIRST natural break (comma,
                  em-dash, semicolon) so we get a punchy headline instead
                  of a full sentence. Reasoning: the AI's first sentence
                  often runs ~25-30 words because it has to satisfy the
                  Executive Summary's "lead with outcome + how + artefact"
                  shape — too dense for a cover. The first clause alone
                  is the outcome statement, which is exactly the cover's
                  job. Falls back to first sentence, then to a 130-char
                  word-boundary trim, if no natural break exists. */}
              {looksProfessional(doc.description) && (() => {
                const COVER_MAX = 130;
                const firstLine = doc.description!.split(/\r?\n/)[0].trim();

                // 1) Prefer the first natural clause break. Require at
                //    least ~30 chars before it so we don't cut on a
                //    leading parenthetical like "At Nuro 7,".
                const breakMatch = firstLine.match(/^.{30,}?(?=\s*[,;—–]\s)/);
                let tagline = (breakMatch?.[0] ?? "").trim();

                // 2) No usable break → fall back to first full sentence.
                if (!tagline) {
                  const sentenceMatch = firstLine.match(/^[^.!?]*[.!?](?=\s+[A-Z]|\s*$)/);
                  tagline = (sentenceMatch?.[0] ?? firstLine).trim();
                }

                // 3) Still too long → word-boundary trim with ellipsis.
                if (tagline.length > COVER_MAX) {
                  const cut = tagline.slice(0, COVER_MAX);
                  const lastSpace = cut.lastIndexOf(" ");
                  tagline = (lastSpace > 60 ? cut.slice(0, lastSpace) : cut)
                    .replace(/[,;:\-–—]\s*$/, "")
                    .trimEnd() + "…";
                }

                // Strip a trailing comma/dash if we cut at a clause break
                // (we don't want "for nifal," — drop the comma).
                tagline = tagline.replace(/[,;:\-–—]\s*$/, "").trimEnd();

                return (
                  <p className="mt-6 max-w-[600px] text-[14px] font-medium leading-[1.6] text-zinc-300">
                    {tagline}
                  </p>
                );
              })()}
            </div>

            {/* ═══ BOTTOM WHITE — data + meta + CTA ═══ */}
            <div className={`shrink-0 ${PAD_X} pt-6 pb-10`}>
              {/* Data row — only render cells with real values. Showing "—"
                  on a ₹14L cover page reads as a half-finished draft. */}
              <div className="border-y-2 border-zinc-900">
                {(() => {
                  const cells: Array<{ l: string; v: string; suf?: string; isMoney?: boolean }> = [];
                  if (totalWeeks > 0) {
                    cells.push({
                      l: "Duration",
                      v: `${totalWeeks}`,
                      suf: totalWeeks === 1 ? "week" : "weeks",
                    });
                  }
                  const phaseCount = phaseSequence.length > 0 ? phaseSequence.length : blocks.length;
                  if (phaseCount > 0) {
                    cells.push({ l: "Phases", v: `${phaseCount}` });
                  }
                  if (included.length > 0) {
                    cells.push({ l: "Deliverables", v: `${included.length}` });
                  }
                  const investmentValue = pricedItems.length > 0
                    ? formatCurrency(pricingSubtotal)
                    : doc.pricing?.split(/\r?\n/)[0];
                  if (investmentValue && investmentValue.trim()) {
                    cells.push({ l: "Investment", v: investmentValue, isMoney: true });
                  }
                  if (cells.length === 0) return null;
                  return (
                  <div
                    className="grid divide-x divide-zinc-200"
                    style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}
                  >
                  {cells.map((c, i) => (
                      <div key={c.l} className={i === 0 ? "pr-5 py-4" : "px-5 py-4"}>
                        <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-zinc-500">
                          {c.l}
                        </div>
                        <div className="mt-1.5 flex items-baseline gap-1.5">
                          <span
                            className={`font-extrabold leading-none tracking-[-0.025em] text-zinc-900 ${
                              c.isMoney ? "text-[22px]" : "text-[28px]"
                            }`}
                          >
                            {c.v}
                          </span>
                          {c.suf && (
                            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                              {c.suf}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  );
                })()}
              </div>

              {/* Meta row — 3 cols, hairline below */}
              <div className="grid grid-cols-3 divide-x divide-zinc-200 border-b border-zinc-200">
                <div className="pr-5 py-3">
                  <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-zinc-500">Client</div>
                  <div className="mt-0.5 truncate text-[13px] font-bold text-zinc-900">{doc.clientName ?? "—"}</div>
                </div>
                <div className="px-5 py-3">
                  <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-zinc-500">Issued</div>
                  <div className="mt-0.5 text-[13px] font-bold text-zinc-900">{formattedFullDate || formattedDate || "—"}</div>
                </div>
                <div className="px-5 py-3">
                  <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-zinc-500">Valid until</div>
                  <div className="mt-0.5 text-[13px] font-bold text-zinc-900">{formattedValid || "—"}</div>
                </div>
              </div>

              {/* CTA — single clean statement, no awkward right-side stuff.
                  Contact info lives on the acceptance page where signature happens. */}
              <div className="mt-5 flex items-center gap-4">
                <div
                  className="grid size-11 shrink-0 place-items-center text-[18px] font-bold leading-none text-white"
                  style={{ backgroundColor: BLACK }}
                >
                  →
                </div>
                <div>
                  <div className="text-[13px] font-bold uppercase tracking-[0.18em] text-zinc-900">
                    Sign &amp; we begin within 72 hours
                  </div>
                  <div className="mt-0.5 text-[10px] tracking-wide text-zinc-500">
                    Acceptance page at the back · or email {orgEmail || (org?.legalName ?? orgName)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Page>

        {/* ════════════════════════════════════════════
            CONTENTS · table of contents (always shown, page 2)
            Editorial list with section number, title, subtitle, page number.
            ════════════════════════════════════════════ */}
        <Page pageNumber={next()} totalPages={pageCount} org={org} doc={doc} documentTitle={documentTitle}>
          <div className={`flex flex-1 flex-col ${PAD_X} pt-8 pb-6`}>
            <SectionHead
              number={secNum()}
              title="Contents"
              subtitle={`Prepared for ${doc.clientName ?? "Client"} · ${sectionCount} sections`}
            />
            <SectionRule />

            <ol className="mt-8 divide-y divide-zinc-200 border-t border-zinc-200">
              {(() => {
                // Calculate page numbers in real time as we walk the section list.
                // `span` lets a multi-page section (e.g. T&Cs) advance the counter
                // by more than 1 without listing each continuation page separately.
                let p = 2; // contents is page 2; cover letter starts at 3
                const rows: { n: string; title: string; sub: string; page: number }[] = [];
                const padN = (i: number) => String(i).padStart(2, "0");
                const push = (title: string, sub: string, span = 1) => {
                  rows.push({ n: padN(rows.length + 1), title, sub, page: p + 1 });
                  p += span;
                };
                push("Cover Letter", "A note from the CEO");
                if (showOverview) push("Executive Summary", "What we'll build, why now");
                push(`Why ${orgName.replace(/\s+/g, "")}`, "Four reasons we're the right fit");
                if (showScope) push("Scope of Work", "Phased execution with sign-off gates");
                push("Our Approach", "Audit → Build → Launch · 3-phase delivery");
                if (showDeliverables) push("Deliverables", "What's included and what's not");
                if (showTimeline) push("Delivery Roadmap", "Phase-by-phase schedule");
                if (showPricing) push("Pricing Breakdown", "Line-by-line investment");
                if (showInvestment) push("Investment Model", "Total cost and payment schedule");
                if (showTerms) push("Terms & Conditions", "Plain-English summary + clauses", termPages.length);
                push("Accept & Begin", "Sign here — we start within 72 hours");
                return rows.map((r) => (
                  <li key={r.n} className="grid grid-cols-12 items-baseline gap-4 py-4">
                    <div className="col-span-1 text-[14px] font-bold tabular-nums text-zinc-400">{r.n}</div>
                    <div className="col-span-8">
                      <div className="text-[15px] font-bold uppercase tracking-[-0.005em] text-zinc-900">
                        {r.title}
                      </div>
                      <div className="mt-0.5 text-[11px] text-zinc-500">{r.sub}</div>
                    </div>
                    <div className="col-span-3 text-right text-[13px] font-bold tabular-nums text-zinc-900">
                      Page {String(r.page).padStart(2, "0")}
                    </div>
                  </li>
                ));
              })()}
            </ol>

            <div className="flex-1" />

            {/* Closing note */}
            <div className="mt-8 border-t-2 border-zinc-900 pt-4 text-[11px] text-zinc-500">
              Read at your pace. The acceptance page is at the back — that's where you sign.
            </div>
          </div>
        </Page>

        {/* ════════════════════════════════════════════
            COVER LETTER
            ════════════════════════════════════════════ */}
        <Page pageNumber={next()} totalPages={pageCount} org={org} doc={doc} documentTitle={documentTitle}>
          <div className={`flex flex-1 flex-col ${PAD_X} pt-8 pb-6`}>
            <SectionHead number={secNum()} title="Cover Letter" subtitle="A note from the CEO" />
            <SectionRule />

            {/* Letter body — conversion-oriented: warm opener, three commitments,
                confident close. Each commitment kills a real buyer objection. */}
            <div className="mt-6">
              <div className="max-w-3xl space-y-4 text-[13px] leading-[1.75] text-zinc-700">
                <p className="text-zinc-500">Dear {doc.clientName?.split(" ")[0] || "Team"},</p>
                <p>
                  Thank you for the opportunity to scope{" "}
                  <span className="font-semibold text-zinc-900">{doc.projectName}</span>. After our conversations and a careful
                  audit of your current setup, we believe a focused{" "}
                  <span className="font-semibold text-zinc-900">
                    {totalWeeks > 0 ? `${totalWeeks}-week ` : ""}
                  </span>
                  engagement can deliver <span className="font-semibold text-zinc-900">measurable outcomes</span> — not just features.
                </p>
                <p>
                  This proposal lays out exactly what we'll build, when each milestone ships, what it costs, and the KPIs
                  we're committing to. Every figure is tied to a concrete deliverable — we don't bill against vague effort.
                </p>

                {/* Three commitments — kills the three biggest tech-buyer objections */}
                <div className="pt-2">
                  <p className="font-semibold text-zinc-900">Three commitments before you read on:</p>
                  <ol className="mt-3 space-y-2.5">
                    <li className="flex items-start gap-3">
                      <span className="mt-0.5 text-[12px] font-bold tabular-nums text-zinc-400">01</span>
                      <span>
                        <span className="font-bold text-zinc-900">Fixed scope.</span>{" "}
                        Anything outside what's listed gets quoted in writing — never silently added to your bill.
                      </span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="mt-0.5 text-[12px] font-bold tabular-nums text-zinc-400">02</span>
                      <span>
                        <span className="font-bold text-zinc-900">Milestone billing.</span>{" "}
                        You pay against accepted work, never upfront for unfinished deliverables.
                      </span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="mt-0.5 text-[12px] font-bold tabular-nums text-zinc-400">03</span>
                      <span>
                        <span className="font-bold text-zinc-900">Pause anytime.</span>{" "}
                        Each phase ends with a sign-off gate. You can stop, continue, or change direction at every milestone.
                      </span>
                    </li>
                  </ol>
                </div>

                <p>We're built to ship this without surprises — and to begin within 72 hours of acceptance.</p>

                <div className="pt-4">
                  <p className="text-zinc-500">Warm regards,</p>
                  <p className="mt-1 text-[15px] font-bold text-zinc-900">
                    {org?.ceoName ?? doc.preparedBy ?? "The Team"}
                  </p>
                  <p className="text-[12px] text-zinc-500">
                    {(org?.ceoTitle ?? "CEO")}, {org?.legalName ?? orgName}
                  </p>
                  {formattedFullDate && <p className="mt-3 text-[11px] text-zinc-400">{formattedFullDate}</p>}
                </div>
              </div>

              {/* Document metadata panel removed — the cover and the contents
                  page already carry status, dates, and section count. No need
                  to repeat on the cover letter. */}
            </div>

            {/* "What's inside" mini-grid removed — replaced by the dedicated
                Contents page (page 2). No more redundancy. */}
            <div className="flex-1" />
          </div>
        </Page>

        {/* ════════════════════════════════════════════
            EXECUTIVE SUMMARY · Problem → Solution → Outcome structure
            Buyer psychology: anchor on the pain, frame solution, end on outcome.
            ════════════════════════════════════════════ */}
        {showOverview && (
          <Page pageNumber={next()} totalPages={pageCount} org={org} doc={doc} documentTitle={documentTitle}>
            <div className={`flex flex-1 flex-col ${PAD_X} pt-8 pb-6`}>
              <SectionHead number={secNum()} title="Executive Summary" subtitle="The problem, the solution, and what success looks like" />
              <SectionRule />

              {/* PROBLEM and SOLUTION blocks fall back to a metadata-driven
                  paragraph if the saved text is too thin to read as a
                  professional paragraph (e.g. the user typed "basic
                  shopify store" into the brief and the AI echoed it).
                  This is the last line of defence — the API-side fix
                  prevents new proposals from ever saving raw text into
                  these fields, but old rows still need a clean render. */}
              {(() => {
                const phaseCount = phaseSequence.length > 0 ? phaseSequence.length : blocks.length;
                const fallbackUnderstanding =
                  `${doc.clientName?.trim() || "The client"} is investing in ${doc.projectName?.trim() || "this engagement"} ` +
                  `to bring a scoped, milestone-billed delivery into production. ` +
                  `${totalWeeks > 0 ? `Work is sequenced across ${totalWeeks} ${totalWeeks === 1 ? "week" : "weeks"} and ${phaseCount} ${phaseCount === 1 ? "phase" : "phases"}, ` : `The plan is decomposed into ${phaseCount} ${phaseCount === 1 ? "phase" : "phases"}, `}` +
                  `each closed with a written sign-off and a working demo so the team can verify progress at every step. ` +
                  `Scope is fixed at signature — anything added later is quoted as a Change Request, not silently absorbed.`;

                const fallbackSolution =
                  `${included.length > 0 ? `${included.length} concrete deliverables` : "A focused, fixed-scope build"} ` +
                  `${totalWeeks > 0 ? `over ${totalWeeks} ${totalWeeks === 1 ? "week" : "weeks"}` : "across milestone gates"}, ` +
                  `with weekly demos, milestone-billed payments, and a 30-day post-launch warranty. ` +
                  `At handover the client receives production-ready software, documentation, and full IP transfer — no lock-in, no maintenance hostage.`;

                const understandingText = looksProfessional(doc.projectUnderstanding) ? doc.projectUnderstanding! : fallbackUnderstanding;
                const solutionRaw = looksProfessional(doc.description) ? doc.description! : fallbackSolution;
                const solutionLines = solutionRaw.split(/\r?\n/);

                return (
                  <>
                    {/* PROBLEM/UNDERSTANDING — loss-aversion frame */}
                    <div className="mt-6">
                      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">
                        The Problem
                      </div>
                      <p className="mt-2 max-w-3xl whitespace-pre-line text-[13px] leading-[1.75] text-zinc-700">
                        {understandingText}
                      </p>
                    </div>

                    {/* SOLUTION — outcome-anchored */}
                    <div className="mt-5">
                      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">
                        The Solution
                      </div>
                      <p className="mt-2 max-w-3xl text-[16px] font-medium leading-[1.55] tracking-[-0.005em] text-zinc-900">
                        {solutionLines[0]}
                      </p>
                      {solutionLines.length > 1 && (
                        <p className="mt-3 max-w-3xl whitespace-pre-line text-[13px] leading-[1.75] text-zinc-700">
                          {solutionLines.slice(1).join("\n")}
                        </p>
                      )}
                    </div>
                  </>
                );
              })()}

              {/* SUCCESS METRICS — fills the previously-empty middle with what
                  "done" looks like. Builds buyer confidence: they know what to
                  expect, they know how to evaluate the engagement. */}
              {/* WHAT SUCCESS LOOKS LIKE — Nuro 7 brand-aligned signals.
                  Anchored in the audit-driven, AI-first, co-founder-led positioning
                  from nuro7.com — not generic dev shop tropes. */}
              <div className="mt-7">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">
                  What success looks like
                </div>
                <p className="mt-2 max-w-2xl text-[12px] leading-[1.6] text-zinc-500">
                  Four concrete signals that this engagement is on track — and how you'll know.
                </p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {[
                    {
                      n: "01",
                      h: "Strategy before code",
                      b: "The audit report and scoped sprint plan come before the first commit. Every line of work maps to an outcome agreed in writing — there's no version where you receive a feature you didn't expect.",
                      sig: "Written strategy · zero scope drift",
                    },
                    {
                      n: "02",
                      h: "Numbers, not just features",
                      b: "Each milestone ships against a measurable improvement — conversion lift, process time saved, errors eliminated, revenue moved. We commit to before/after KPIs at signature, and prove them at launch.",
                      sig: "KPIs at signature · before/after at launch",
                    },
                    {
                      n: "03",
                      h: "Predictable shipping, no surprises",
                      b: "Weekly demos, written Monday status notes, four phase sign-off gates, and milestone-based billing. If a date is at risk, you hear about it before it slips — never after.",
                      sig: "4 sign-off gates · weekly demos · milestone billing",
                    },
                    {
                      n: "04",
                      h: "Yours from day one of launch",
                      b: "Source code, AI agent playbooks, deployment runbook, and admin training — all transferred to your team at launch. No vendor lock-in, no maintenance hostage.",
                      sig: "Full IP · documented · zero lock-in",
                    },
                  ].map((s) => (
                    <div key={s.h} className="border border-zinc-200 px-4 py-3.5">
                      <div className="flex items-baseline gap-3">
                        <span className="text-[11px] font-bold tabular-nums text-zinc-400">{s.n}</span>
                        <h4 className="text-[13px] font-bold text-zinc-900">{s.h}</h4>
                      </div>
                      <p className="mt-1.5 text-[11px] leading-[1.6] text-zinc-600">{s.b}</p>
                      <div className="mt-2.5 border-t border-zinc-200 pt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-700">
                        → {s.sig}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Spacer + closing pull quote anchors the page bottom.
                  Replaces dead vertical space with a confident value statement. */}
              <div className="flex-1" />
              <div className="mt-6 border-t-2 border-zinc-900 pt-4 text-center">
                <div className="text-[14px] font-semibold leading-snug tracking-[-0.005em] text-zinc-900">
                  &ldquo;Make your business measurably faster — built by us, powered by you.&rdquo;
                </div>
                <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">
                  Our promise to every engagement
                </div>
              </div>
            </div>
          </Page>
        )}

        {/* ════════════════════════════════════════════
            WHY {ORG} · differentiators + track record (always shown)
            Buyer psychology: authority + risk reversal + specificity.
            Lives between Executive Summary and Scope so trust is built before
            the buyer evaluates "what" and "how much."
            ════════════════════════════════════════════ */}
        <Page pageNumber={next()} totalPages={pageCount} org={org} doc={doc} documentTitle={documentTitle}>
          <div className={`flex flex-1 flex-col ${PAD_X} pt-8 pb-6`}>
            <SectionHead
              number={secNum()}
              title={`Why ${orgName.replace(/\s+/g, "")}`}
              subtitle="Four reasons our clients return, project after project"
            />
            <SectionRule />

            <p className="mt-6 max-w-2xl text-[13px] leading-[1.7] text-zinc-600">
              You're choosing a partner, not just a vendor. Here's what makes the difference between a project that
              ships clean and one that drags on with surprises.
            </p>

            {/* 4 differentiators — aligned with Nuro 7's real positioning from nuro7.com:
                AI-first audit approach, co-founder-led delivery, multi-domain expertise,
                India + Dubai operations. */}
            <div className="mt-6 grid grid-cols-2 gap-3">
              {[
                {
                  n: "01",
                  t: "Audit-first thinking",
                  b: "We start every engagement with an audit to find automation and growth opportunities — not just feature lists. The result is software built to make your business measurably faster, not just functional.",
                  proof: "Outcome-led · refundable if no quick wins surface",
                },
                {
                  n: "02",
                  t: "Production-grade by default",
                  b: "Performance budgets, accessibility audits, error monitoring, structured logging, and security review — built into every engagement from day one. Your software ships without technical debt to clean up later.",
                  proof: "Zero-debt handover · audit-grade quality",
                },
                {
                  n: "03",
                  t: "One team, four disciplines",
                  b: "AI & automation, custom software, cybersecurity, and e-commerce — under one roof, with one shared data architecture and one accountable team.",
                  proof: "Single accountability across the full stack",
                },
                {
                  n: "04",
                  t: "Risk-proof engagement",
                  b: "Phase-by-phase sign-off gates and milestone billing. You review, pause, or change direction at every checkpoint — never locked into work that isn't working.",
                  proof: "Pause anytime · pay for delivered value",
                },
              ].map((d) => (
                <div key={d.n} className="flex flex-col border border-zinc-200 p-5">
                  <div className="flex items-baseline gap-3">
                    <span className="text-[11px] font-bold tabular-nums text-zinc-400">{d.n}</span>
                    <h3 className="text-[14px] font-bold text-zinc-900">{d.t}</h3>
                  </div>
                  <p className="mt-2 text-[12px] leading-[1.65] text-zinc-600">{d.b}</p>
                  <div className="mt-auto pt-3">
                    <div className="border-t border-zinc-200 pt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-700">
                      → {d.proof}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Track record stat strip — moved up directly under cards (no flex spacer) */}
            <div className="mt-6 border-t-2 border-zinc-900 pt-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">
                Track record
              </div>
              <div className="mt-4 grid grid-cols-4 border border-zinc-200 divide-x divide-zinc-200">
                {[
                  { v: "20", suf: "+", l: "Customers shipped" },
                  { v: "90", suf: "%", l: "Project success rate" },
                  { v: "4", suf: "", l: "Service domains" },
                  { v: "2", suf: "", l: "Cities · Kochi & Dubai" },
                ].map((s) => (
                  <div key={s.l} className="px-5 py-4">
                    <div className="text-[24px] font-extrabold leading-none tracking-[-0.025em] text-zinc-900">
                      {s.v}
                      <span className="text-zinc-300">{s.suf}</span>
                    </div>
                    <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                      {s.l}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Case Study — AI-automation engagement matching Nuro 7's real portfolio.
                Pulled from the e-commerce automation testimonial on nuro7.com. */}
            <div className="mt-6 border-t-2 border-zinc-900 pt-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">
                Case Study · Recent work
              </div>
              <h3 className="mt-2 text-[15px] font-bold tracking-[-0.005em] text-zinc-900">
                AI-powered e-commerce automation for a growing brand
              </h3>
              <div className="mt-3 grid grid-cols-3 gap-4">
                <div className="border-l-2 border-zinc-900 pl-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                    Challenge
                  </div>
                  <p className="mt-1.5 text-[11px] leading-[1.6] text-zinc-700">
                    Manual operations — order routing, inventory sync, customer queries — were eating
                    most of the founding team's week, blocking strategic growth.
                  </p>
                </div>
                <div className="border-l-2 border-zinc-900 pl-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                    Solution
                  </div>
                  <p className="mt-1.5 text-[11px] leading-[1.6] text-zinc-700">
                    Audit-first design, then a custom AI agent stack handling operations end-to-end —
                    integrated with the existing OMS, mailer, and customer-support tools.
                  </p>
                </div>
                <div className="border-l-2 border-zinc-900 pl-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                    Result
                  </div>
                  <p className="mt-1.5 text-[11px] leading-[1.6] text-zinc-700">
                    Daily ops <span className="font-bold text-zinc-900">automated end-to-end</span>. The team
                    moved from operations to strategy. Founder: <em>&ldquo;transformed our business.&rdquo;</em>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Page>

        {/* ════════════════════════════════════════════
            SCOPE / PHASES — phase bands matching reference
            ════════════════════════════════════════════ */}
        {showScope && (() => {
          // SectionHead only renders on the first chunk; continuation
          // chunks get a slim "Scope of Work (continued)" label so the
          // reader knows it's the same section, and the section number
          // is consumed exactly once.
          const scopeSecNum = secNum();
          return scopeChunks.map((chunk, chunkIdx) => {
            const isFirst = chunkIdx === 0;
            const isLast = chunkIdx === scopeChunks.length - 1;
            // Phase index offset so the second page picks up at Phase 04
            // instead of restarting at 01.
            const offset = chunkIdx * SCOPE_PHASES_PER_PAGE;
            return (
              <Page
                key={`scope-${chunkIdx}`}
                pageNumber={next()}
                totalPages={pageCount}
                org={org}
                doc={doc}
                documentTitle={documentTitle}
              >
                <div className={`flex flex-1 flex-col ${PAD_X} pt-8 pb-6`}>
                  {isFirst ? (
                    <>
                      <SectionHead number={scopeSecNum} title="Scope of Work" subtitle="Phased execution — each phase independently reviewable" />
                      <SectionRule />
                      <p className="mt-6 max-w-2xl text-[12px] leading-[1.7] text-zinc-500">
                        Each phase ends with a demo and your written sign-off before we move to the next.
                      </p>
                    </>
                  ) : (
                    <div className="border-l-2 border-zinc-900 pl-3">
                      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">
                        Section {scopeSecNum} — continued
                      </div>
                      <h2 className="mt-0.5 text-[18px] font-bold tracking-[-0.01em] text-zinc-900 uppercase">
                        Scope of Work
                      </h2>
                    </div>
                  )}
                  <div className={`${isFirst ? "mt-6" : "mt-5"} space-y-3`}>
                    {chunk.map((b, i) => {
                      const realIdx = offset + i;
                      const num = String(realIdx + 1).padStart(2, "0");
                      const dur = b.durationWeeks != null && Number(b.durationWeeks) > 0
                        ? ` · ${Number(b.durationWeeks)} ${Number(b.durationWeeks) === 1 ? "week" : "weeks"}`
                        : "";
                      const headerLabel = `Phase ${num}${dur}${b.heading ? ` · ${b.heading}` : ""}`;
                      const items = (b.content ?? "")
                        .split(/\r?\n/)
                        .map((l) => l.replace(/^[-*▸•►]\s*/, "").trim())
                        .filter(Boolean)
                        .map((t) => ({ text: t }));
                      return items.length > 0 ? (
                        <Band key={realIdx} title={headerLabel} items={items} />
                      ) : (
                        <div key={realIdx} className="border border-zinc-200">
                          <div className={`${PAD_X} py-2.5 text-[12px] font-bold uppercase tracking-[0.16em] text-white`} style={{ backgroundColor: BLACK }}>
                            {headerLabel}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {isLast && totalWeeks > 0 && (
                    <div className="mt-6 flex items-baseline justify-between border-t-2 border-zinc-900 pt-3">
                      <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">Total duration</span>
                      <span className="text-[15px] font-bold tabular-nums text-zinc-900">
                        {totalWeeks} {totalWeeks === 1 ? "week" : "weeks"}
                      </span>
                    </div>
                  )}
                </div>
              </Page>
            );
          });
        })()}

        {/* ════════════════════════════════════════════
            OUR APPROACH · how we work week-to-week (always shown)
            Buyer psychology: reduces uncertainty. Tech buyers' #1 anxiety is
            "will I know what's happening?" This page answers it cold.
            ════════════════════════════════════════════ */}
        <Page pageNumber={next()} totalPages={pageCount} org={org} doc={doc} documentTitle={documentTitle}>
          <div className={`flex flex-1 flex-col ${PAD_X} pt-8 pb-6`}>
            <SectionHead
              number={secNum()}
              title="Our Approach"
              subtitle="Audit → Build → Launch · our proven 3-phase delivery model"
            />
            <SectionRule />

            <p className="mt-6 max-w-2xl text-[13px] leading-[1.7] text-zinc-600">
              Every Tectomi engagement runs through three phases — Audit, Build, Launch — backed by weekly
              sprints, written status updates, and live demos. You always know what shipped, what's next,
              and what we need from you.
            </p>

            {/* Three-phase delivery model — Audit / Build / Launch */}
            <div className="mt-6 grid grid-cols-3 gap-3">
              {[
                {
                  n: "01",
                  t: "Audit",
                  b: "We map your current state, identify automation and growth opportunities, and propose the highest-leverage build sequence. Output: written strategy + scoped sprint plan.",
                },
                {
                  n: "02",
                  t: "Build",
                  b: "Custom design and development in 1-week sprints. Each sprint ships working software in your environment. Two rounds of revisions per major deliverable.",
                },
                {
                  n: "03",
                  t: "Launch",
                  b: "Quality assurance, security pass, soft launch behind a password, then full launch. Includes admin training and a 30-day post-launch warranty.",
                },
              ].map((p) => (
                <div key={p.n} className="border border-zinc-200 p-4">
                  <div className="text-[11px] font-bold tabular-nums text-zinc-400">{p.n}</div>
                  <div className="mt-2 text-[14px] font-bold uppercase tracking-wide text-zinc-900">{p.t}</div>
                  <p className="mt-1.5 text-[11px] leading-[1.6] text-zinc-600">{p.b}</p>
                </div>
              ))}
            </div>

            {/* Phase gates — risk-reversal narrative */}
            <div className="mt-6">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">
                Phase gates — your decision points
              </div>
              <div className="mt-3 border border-zinc-200">
                {[
                  {
                    n: "→",
                    t: "Audit sign-off",
                    b: "After Phase 01 you sign off on the audit findings and proposed strategy. Stop here, change direction, or continue.",
                  },
                  {
                    n: "→",
                    t: "Design sign-off",
                    b: "Before any code is written, you sign off on the visual design and UX flows.",
                  },
                  {
                    n: "→",
                    t: "Build sign-off",
                    b: "End of every sprint: working software in your environment, your written acceptance.",
                  },
                  {
                    n: "→",
                    t: "Launch sign-off",
                    b: "Soft launch, your QA, your written go-live approval — then full launch.",
                  },
                ].map((g, i, arr) => (
                  <div
                    key={g.t}
                    className={`flex items-start gap-4 px-5 py-3 ${i < arr.length - 1 ? "border-b border-zinc-200" : ""}`}
                  >
                    <span className="text-[14px] font-bold text-zinc-400">{g.n}</span>
                    <div className="flex-1">
                      <div className="text-[13px] font-bold text-zinc-900">{g.t}</div>
                      <p className="mt-0.5 text-[11px] leading-[1.6] text-zinc-600">{g.b}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex-1" />

            {/* What this means for you — anchor the value */}
            <div className="mt-6 border-2 border-zinc-900 px-6 py-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">
                What this means for you
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-8 gap-y-2 text-[12px] leading-[1.55] text-zinc-800">
                <div className="flex items-start gap-2">
                  <span className="font-bold text-zinc-900">✓</span>
                  <span>You always know status — no chasing for updates</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold text-zinc-900">✓</span>
                  <span>You can pause at any sprint boundary</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold text-zinc-900">✓</span>
                  <span>You see working software every week, not just at the end</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold text-zinc-900">✓</span>
                  <span>Decisions you need to make are listed in advance</span>
                </div>
              </div>
            </div>
          </div>
        </Page>

        {/* ════════════════════════════════════════════
            DELIVERABLES
            ════════════════════════════════════════════ */}
        {showDeliverables && (() => {
          const deliverablesSecNum = secNum();
          return Array.from({ length: deliverableChunkCount }).map((_, chunkIdx) => {
            const isFirst = chunkIdx === 0;
            const isLast = chunkIdx === deliverableChunkCount - 1;
            const incChunk = includedChunks[chunkIdx] ?? [];
            const excChunk = excludedChunks[chunkIdx] ?? [];
            const incOffset = chunkIdx * DELIVERABLES_PER_COL_PER_PAGE;
            const excOffset = chunkIdx * DELIVERABLES_PER_COL_PER_PAGE;
            return (
              <Page
                key={`deliverables-${chunkIdx}`}
                pageNumber={next()}
                totalPages={pageCount}
                org={org}
                doc={doc}
                documentTitle={documentTitle}
              >
                <div className={`flex flex-1 flex-col ${PAD_X} pt-8 pb-6`}>
                  {isFirst ? (
                    <>
                      <SectionHead number={deliverablesSecNum} title="Deliverables" subtitle="A clear line between what's built and what stays the client's responsibility" />
                      <SectionRule />
                      <p className="mt-5 max-w-2xl text-[12px] leading-[1.7] text-zinc-500">
                        Pricing for each line item is on the Pricing Breakdown page. This page is
                        purely about scope — what gets built and what stays the client's responsibility.
                      </p>
                    </>
                  ) : (
                    <div className="border-l-2 border-zinc-900 pl-3">
                      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">
                        Section {deliverablesSecNum} — continued
                      </div>
                      <h2 className="mt-0.5 text-[18px] font-bold tracking-[-0.01em] text-zinc-900 uppercase">
                        Deliverables
                      </h2>
                    </div>
                  )}
                  <div className={`${isFirst ? "mt-6" : "mt-5"} grid grid-cols-2 gap-4`}>
                    {/* Included */}
                    <div className="border border-zinc-200">
                      <div
                        className={`${PAD_X} py-2.5 text-[12px] font-bold uppercase tracking-[0.16em] text-white`}
                        style={{ backgroundColor: BLACK }}
                      >
                        Included ({included.length}){deliverableChunkCount > 1 && incChunk.length > 0 ? ` · ${incOffset + 1}–${incOffset + incChunk.length}` : ""}
                      </div>
                      <ul className="divide-y divide-zinc-100 bg-white">
                        {incChunk.map((d, i) => (
                          <li key={incOffset + i} className={`${PAD_X} py-3`}>
                            <div className="flex items-baseline gap-2">
                              <span className="text-zinc-500">▸</span>
                              <span className="text-[13px] font-semibold text-zinc-900">{d.title}</span>
                            </div>
                            {d.description && (
                              <p className="ml-5 mt-1 text-[11px] leading-relaxed text-zinc-500">{d.description}</p>
                            )}
                          </li>
                        ))}
                        {incChunk.length === 0 && (
                          <li className={`${PAD_X} py-3 text-[11px] italic text-zinc-400`}>
                            All included items listed on the previous page.
                          </li>
                        )}
                      </ul>
                    </div>

                    {/* Excluded */}
                    <div className="border border-zinc-200">
                      <div
                        className={`${PAD_X} py-2.5 text-[12px] font-bold uppercase tracking-[0.16em] text-zinc-700`}
                        style={{ backgroundColor: "#e4e4e7" }}
                      >
                        Not Included ({excluded.length}){deliverableChunkCount > 1 && excChunk.length > 0 ? ` · ${excOffset + 1}–${excOffset + excChunk.length}` : ""}
                      </div>
                      <ul className="divide-y divide-zinc-100 bg-zinc-50/40">
                        {excChunk.map((d, i) => (
                          <li key={excOffset + i} className={`${PAD_X} py-3`}>
                            <div className="flex items-baseline gap-2">
                              <span className="text-zinc-400">×</span>
                              <span className="text-[13px] text-zinc-700">{d.title}</span>
                            </div>
                            {d.description && (
                              <p className="ml-5 mt-0.5 text-[11px] leading-relaxed text-zinc-500">{d.description}</p>
                            )}
                          </li>
                        ))}
                        {excChunk.length === 0 && (
                          <li className={`${PAD_X} py-3 text-[11px] italic text-zinc-400`}>
                            All exclusions listed on the previous page.
                          </li>
                        )}
                      </ul>
                    </div>
                  </div>
                  {isLast && (
                    <p className="mt-5 text-[11px] italic text-zinc-500">
                      Anything not listed above remains the client's responsibility unless contracted separately.
                    </p>
                  )}
                </div>
              </Page>
            );
          });
        })()}

        {/* ════════════════════════════════════════════
            TIMELINE / DELIVERY ROADMAP
            Note: Timeline now appears BEFORE Pricing — buyers want
            "when" before "how much" in their mental model.
            ════════════════════════════════════════════ */}
        {showTimeline && (
          <Page pageNumber={next()} totalPages={pageCount} org={org} doc={doc} documentTitle={documentTitle}>
            <div className={`flex flex-1 flex-col ${PAD_X} pt-8 pb-6`}>
              <SectionHead number={secNum()} title="Delivery Roadmap" subtitle="Phased execution — value delivered at every milestone" />
              <SectionRule />

              {phaseSequence.length > 0 ? (
                <>
                  <p className="mt-6 max-w-2xl text-[12px] leading-[1.7] text-zinc-500">
                    {totalWeeks} {totalWeeks === 1 ? "week" : "weeks"} of work across {phaseSequence.length}{" "}
                    {phaseSequence.length === 1 ? "phase" : "phases"}, run sequentially. Sign-off gate at the end of each phase.
                  </p>

                  {/* Continuous-bar Gantt — one solid bar per phase positioned by
                      percentage on a shared track. Avoids the per-week tile
                      approach which breaks visually past ~12 weeks (cells get
                      too thin and gaps look like missing data). */}
                  <div className="mt-6 border border-zinc-200 p-5">
                    {/* Week ruler — nice step size so ticks stay evenly spaced
                        regardless of duration. Each label centers on the middle
                        of its week so it aligns with the bar coordinates (bars
                        use cursor/totalWeeks for start, span/totalWeeks for
                        width). */}
                    {(() => {
                      const step =
                        totalWeeks <= 6 ? 1 :
                        totalWeeks <= 12 ? 2 :
                        totalWeeks <= 24 ? 4 :
                        totalWeeks <= 48 ? 8 : 12;
                      const ticks: number[] = [];
                      for (let w = 1; w <= totalWeeks; w += step) ticks.push(w);
                      const last = ticks[ticks.length - 1];
                      if (last !== totalWeeks) {
                        // Drop the second-to-last interior tick if labelling
                        // the final week would land too close to it.
                        if (totalWeeks - last <= step / 2) ticks[ticks.length - 1] = totalWeeks;
                        else ticks.push(totalWeeks);
                      }
                      return (
                        <>
                          <div className="ml-[180px] flex items-end pb-1">
                            <div className="relative h-4 w-full">
                              {ticks.map((week) => {
                                // Center the label on the middle of week N so
                                // it lives inside the W{N} column visually.
                                const pct = ((week - 0.5) / totalWeeks) * 100;
                                return (
                                  <div
                                    key={week}
                                    className="absolute -translate-x-1/2 text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-400 tabular-nums"
                                    style={{ left: `${pct}%` }}
                                  >
                                    W{week}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          <div className="ml-[180px] border-t border-zinc-900" />
                        </>
                      );
                    })()}

                    {(() => {
                      let cursor = 0;
                      return phaseSequence.map((b, i) => {
                        const span = Number(b.durationWeeks ?? 0);
                        const startPct = (cursor / totalWeeks) * 100;
                        const widthPct = (span / totalWeeks) * 100;
                        const startWeek = cursor + 1;
                        const endWeek = cursor + span;
                        cursor += span;
                        return (
                          <div
                            key={i}
                            className="flex items-center border-b border-zinc-100 py-4 last:border-none"
                          >
                            <div className="w-[180px] pr-4">
                              <div className="text-[10px] font-bold tabular-nums text-zinc-400">
                                P{String(i + 1).padStart(2, "0")} · W{startWeek}{startWeek === endWeek ? "" : `–${endWeek}`}
                              </div>
                              <div className="mt-0.5 text-[12px] font-bold leading-tight text-zinc-900">{b.heading}</div>
                            </div>
                            {/* Phase bar — one continuous block positioned by % */}
                            <div className="relative h-8 flex-1">
                              <div className="absolute inset-x-0 top-1/2 h-px bg-zinc-200" />
                              <div
                                className="absolute top-1 bottom-1 flex items-center justify-center px-2 text-[10px] font-bold uppercase tracking-[0.15em] text-white"
                                style={{
                                  left: `${startPct}%`,
                                  width: `${widthPct}%`,
                                  backgroundColor: BLACK,
                                }}
                              >
                                {span >= 3 ? `${span} ${span === 1 ? "wk" : "wks"}` : null}
                              </div>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </>
              ) : null}

              {/* Phase summary cards */}
              {phaseSequence.length > 0 && (
                <div className="mt-6 grid grid-cols-2 gap-3">
                  {(() => {
                    let cursor = 0;
                    return phaseSequence.map((b, i) => {
                      const startWeek = cursor + 1;
                      const endWeek = cursor + Number(b.durationWeeks ?? 0);
                      cursor += Number(b.durationWeeks ?? 0);
                      return (
                        <div key={i} className="border border-zinc-200 px-4 py-3">
                          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                            Phase {String(i + 1).padStart(2, "0")} · Weeks {startWeek}–{endWeek}
                          </div>
                          <div className="mt-1 text-[13px] font-bold text-zinc-900">{b.heading}</div>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}

              {/* Fallback when no structured phases are defined: derive a tasteful
                  3-phase split (Audit → Build → Launch) from doc.timeline so the
                  page still fills the canvas instead of leaving a near-blank A4. */}
              {doc.timeline && phaseSequence.length === 0 && (() => {
                // Try to extract a week count from the timeline string ("12 weeks" → 12).
                const match = (doc.timeline as string).match(/(\d+(?:\.\d+)?)\s*(week|weeks|w|month|months|mo|day|days)?/i);
                const weeks = match ? Math.max(1, Math.round(Number(match[1]) * (match[2]?.toLowerCase().startsWith("month") ? 4 : match[2]?.toLowerCase().startsWith("day") ? 1 / 5 : 1))) : 0;
                const splits =
                  weeks > 0
                    ? [
                        { label: "Audit & Plan", subtitle: "Discovery, requirements, architecture", w: Math.max(1, Math.round(weeks * 0.2)) },
                        { label: "Build & Iterate", subtitle: "Implementation with weekly demos", w: Math.max(1, Math.round(weeks * 0.6)) },
                        { label: "Launch & Handover", subtitle: "QA, deploy, documentation, training", w: Math.max(1, weeks - Math.round(weeks * 0.2) - Math.round(weeks * 0.6)) },
                      ]
                    : [];
                if (splits.length === 0) {
                  // Couldn't parse a duration — just show the raw timeline string cleanly.
                  return (
                    <p className="mt-6 max-w-2xl whitespace-pre-line text-[13px] leading-[1.75] text-zinc-700">
                      {doc.timeline}
                    </p>
                  );
                }
                const total = splits.reduce((s, p) => s + p.w, 0);
                let cursor = 0;
                return (
                  <>
                    <p className="mt-6 max-w-2xl text-[12px] leading-[1.7] text-zinc-500">
                      {total} {total === 1 ? "week" : "weeks"} of work across {splits.length} phases, run sequentially.
                    </p>

                    <div className="mt-6 grid grid-cols-3 gap-3">
                      {splits.map((p, i) => {
                        const start = cursor + 1;
                        const end = cursor + p.w;
                        cursor += p.w;
                        return (
                          <div key={i} className="flex flex-col border border-zinc-200 p-4">
                            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                              Phase {String(i + 1).padStart(2, "0")}
                            </div>
                            <div className="mt-1 text-[14px] font-bold text-zinc-900">{p.label}</div>
                            <p className="mt-1 flex-1 text-[11px] leading-[1.55] text-zinc-600">{p.subtitle}</p>
                            <div className="mt-3 border-t border-zinc-100 pt-2 text-[11px] font-medium tabular-nums text-zinc-700">
                              Weeks {start}{start === end ? "" : `–${end}`}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <p className="mt-6 max-w-2xl text-[11px] italic leading-[1.6] text-zinc-500">
                      Schedule shown as an even split across phases — actual durations
                      may shift slightly during the audit. Total timeline:{" "}
                      <span className="font-semibold text-zinc-700">{doc.timeline}</span>.
                    </p>
                  </>
                );
              })()}

            </div>
          </Page>
        )}

        {/* ════════════════════════════════════════════
            PRICING — line by line
            (now lives between Timeline and Investment Model)
            ════════════════════════════════════════════ */}
        {showPricing && (() => {
          const pricingSecNum = secNum();
          return pricingChunks.map((chunk, chunkIdx) => {
            const isFirst = chunkIdx === 0;
            const isLast = chunkIdx === pricingChunks.length - 1;
            const offset = chunkIdx * PRICING_ROWS_PER_PAGE;
            return (
              <Page
                key={`pricing-${chunkIdx}`}
                pageNumber={next()}
                totalPages={pageCount}
                org={org}
                doc={doc}
                documentTitle={documentTitle}
              >
                <div className={`flex flex-1 flex-col ${PAD_X} pt-8 pb-6`}>
                  {isFirst ? (
                    <>
                      <SectionHead number={pricingSecNum} title="Pricing Breakdown" subtitle="Transparent, line-by-line investment per feature" />
                      <SectionRule />
                      <p className="mt-6 max-w-2xl text-[12px] leading-[1.7] text-zinc-500">
                        Fixed-scope pricing. Taxes additional as applicable.
                      </p>
                    </>
                  ) : (
                    <div className="border-l-2 border-zinc-900 pl-3">
                      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">
                        Section {pricingSecNum} — continued
                      </div>
                      <h2 className="mt-0.5 text-[18px] font-bold tracking-[-0.01em] text-zinc-900 uppercase">
                        Pricing Breakdown
                      </h2>
                    </div>
                  )}

                  <table className={`${isFirst ? "mt-6" : "mt-5"} w-full border border-zinc-200 text-[13px]`}>
                    <thead style={{ backgroundColor: BLACK }}>
                      <tr className="text-white">
                        <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.18em] w-12">#</th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.18em]">Feature</th>
                        <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase tracking-[0.18em] w-32">Investment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chunk.map((item, i) => {
                        const realIdx = offset + i;
                        return (
                          <tr key={realIdx} className={realIdx % 2 === 0 ? "bg-white" : "bg-zinc-50/60"}>
                            <td className="border-t border-zinc-100 px-4 py-3 align-top text-[12px] font-bold tabular-nums text-zinc-400">
                              {String(realIdx + 1).padStart(2, "0")}
                            </td>
                            <td className="border-t border-zinc-100 px-4 py-3 align-top">
                              <div className="text-[13px] font-semibold text-zinc-900">{item.title}</div>
                              {item.description && (
                                <div className="mt-1 text-[11px] leading-relaxed text-zinc-500">{item.description}</div>
                              )}
                            </td>
                            <td className="border-t border-zinc-100 px-4 py-3 align-top text-right text-[13px] font-bold tabular-nums text-zinc-900">
                              {formatCurrency(Number(item.amount))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {/* Subtotal only on the final pricing page so the total
                        reflects every row across all pages, not just the
                        rows on this slice. */}
                    {isLast && (
                      <tfoot>
                        <tr style={{ backgroundColor: BLACK }} className="text-white">
                          <td colSpan={2} className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.2em]">
                            Subtotal
                          </td>
                          <td className="px-4 py-3 text-right text-[16px] font-bold tabular-nums">
                            {formatCurrency(pricingSubtotal)}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>

                  {isLast && (
                    /* Risk-reversal anchors — kills 3 common objections */
                    <div className="mt-5 grid grid-cols-3 gap-3 text-[11px]">
                      <div className="border border-zinc-200 px-4 py-3">
                        <div className="font-bold uppercase tracking-[0.16em] text-zinc-900">Fixed scope</div>
                        <div className="mt-1 text-zinc-500">No surprise change-orders. Anything new is quoted in writing first.</div>
                      </div>
                      <div className="border border-zinc-200 px-4 py-3">
                        <div className="font-bold uppercase tracking-[0.16em] text-zinc-900">Milestone billing</div>
                        <div className="mt-1 text-zinc-500">You pay for what's accepted, never upfront for unfinished work.</div>
                      </div>
                      <div className="border border-zinc-200 px-4 py-3">
                        <div className="font-bold uppercase tracking-[0.16em] text-zinc-900">Pause anytime</div>
                        <div className="mt-1 text-zinc-500">Each phase ends with sign-off. You can stop or continue at every gate.</div>
                      </div>
                    </div>
                  )}
                </div>
              </Page>
            );
          });
        })()}

        {/* ════════════════════════════════════════════
            INVESTMENT MODEL
            ════════════════════════════════════════════ */}
        {showInvestment && (
          <Page pageNumber={next()} totalPages={pageCount} org={org} doc={doc} documentTitle={documentTitle}>
            <div className={`flex flex-1 flex-col ${PAD_X} pt-8 pb-6`}>
              <SectionHead number={secNum()} title="Investment Model" subtitle="Transparent, milestone-based — pay for delivered value" />
              <SectionRule />

              {doc.pricing && (
                <div className="mt-6 border border-zinc-200">
                  <div
                    className={`${PAD_X} py-2.5 text-[11px] font-bold uppercase tracking-[0.2em] text-white`}
                    style={{ backgroundColor: BLACK }}
                  >
                    Total Investment
                  </div>
                  <div className={`${PAD_X} py-6`}>
                    <div className="whitespace-pre-line text-[36px] font-extrabold leading-tight tracking-[-0.025em] text-zinc-900">
                      {doc.pricing}
                    </div>
                    <p className="mt-2 text-[11px] text-zinc-500">
                      Fixed-scope · billed in stages · taxes additional as applicable.
                    </p>
                  </div>
                </div>
              )}

              {/* Value-anchor panel — re-frames the headline price in
                  per-unit terms a buyer can mentally compare against an
                  in-house hire. Only renders when we have a real subtotal
                  and total weeks (otherwise the math is bogus). */}
              {pricingSubtotal > 0 && totalWeeks > 0 && (
                <div className="mt-5">
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">
                    Value at a glance
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-3 text-[12px]">
                    {(() => {
                      const perWeek = pricingSubtotal / totalWeeks;
                      const perDeliv = included.length > 0 ? pricingSubtotal / included.length : 0;
                      const cells: Array<{ l: string; v: string; sub: string }> = [];
                      cells.push({
                        l: "Per week of work",
                        v: formatCurrency(Math.round(perWeek)),
                        sub: `Across ${totalWeeks} ${totalWeeks === 1 ? "week" : "weeks"} of senior delivery`,
                      });
                      if (perDeliv > 0) {
                        cells.push({
                          l: "Per deliverable",
                          v: formatCurrency(Math.round(perDeliv)),
                          sub: `${included.length} concrete artefacts shipped`,
                        });
                      }
                      cells.push({
                        l: "vs in-house hire",
                        v: "0",
                        sub: "Months of payroll, recruiting, ramp-up before code ships",
                      });
                      return cells.map((c) => (
                        <div key={c.l} className="border border-zinc-200 px-4 py-3">
                          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                            {c.l}
                          </div>
                          <div className="mt-1.5 text-[20px] font-extrabold leading-none tracking-[-0.025em] text-zinc-900 tabular-nums">
                            {c.v}
                          </div>
                          <p className="mt-2 text-[10px] leading-[1.55] text-zinc-500">{c.sub}</p>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              )}

              {doc.paymentTermsText && (
                <div className="mt-6">
                  <div className="text-[12px] font-bold uppercase tracking-[0.18em] text-zinc-900">
                    Payment Schedule
                  </div>
                  <table className="mt-3 w-full border border-zinc-200 text-[13px]">
                    <thead style={{ backgroundColor: BLACK }}>
                      <tr className="text-white">
                        <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.18em] w-20">Stage</th>
                        <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.18em]">Milestone</th>
                        <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.18em] w-20">Share</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {doc.paymentTermsText.split(/\r?\n/).filter((l) => l.trim()).map((line, i) => {
                        const trimmed = line.trim();
                        const pctMatch = trimmed.match(/(\d+)\s*%/);
                        const pct = pctMatch?.[1];
                        const splitChar = trimmed.match(/[—:-]/);
                        const headingPart = splitChar ? trimmed.slice(0, splitChar.index!).trim() : trimmed;
                        const bodyPart = splitChar ? trimmed.slice(splitChar.index! + 1).trim() : "";
                        return (
                          <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-zinc-50/60"}>
                            <td className="border-t border-zinc-100 px-4 py-3 align-top text-[12px] font-bold tabular-nums text-zinc-400">
                              {String(i + 1).padStart(2, "0")}
                            </td>
                            <td className="border-t border-zinc-100 px-4 py-3 align-top">
                              <div className="text-[13px] font-semibold text-zinc-900">{headingPart}</div>
                              {bodyPart && <div className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">{bodyPart}</div>}
                            </td>
                            <td className="border-t border-zinc-100 px-4 py-3 align-top text-right text-[14px] font-bold tabular-nums text-zinc-900">
                              {pct ? `${pct}%` : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ─── ANNUAL MAINTENANCE & SUPPORT (AMC) ───
                  Standard recurring services pricing — common in IT proposals,
                  reassures clients that we'll be around after launch. */}
              <div className="mt-6">
                <div className="text-[12px] font-bold uppercase tracking-[0.18em] text-zinc-900">
                  Annual Maintenance &amp; Support
                </div>
                <p className="mt-2 max-w-2xl text-[12px] leading-[1.6] text-zinc-500">
                  Optional post-launch coverage. Pick the model that fits how often you'll need our hands on the codebase.
                </p>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  {[
                    {
                      l: "AMC plan",
                      v: "15%",
                      sub: "of project cost · billed annually",
                      d: "Updates, security patches, monitoring, and minor content changes.",
                    },
                    {
                      l: "Ad-hoc support",
                      v: "₹900",
                      sub: "per hour",
                      d: "For one-off changes outside an active AMC. Billed against logged time.",
                    },
                    {
                      l: "Support hours",
                      v: "10–6",
                      sub: "Mon–Fri · IST",
                      d: "Response within 1 business day. Emergency escalation available on AMC.",
                    },
                  ].map((c) => (
                    <div key={c.l} className="border border-zinc-200 px-4 py-3">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                        {c.l}
                      </div>
                      <div className="mt-1.5 flex items-baseline gap-1.5">
                        <span className="text-[20px] font-extrabold leading-none tracking-[-0.025em] text-zinc-900">
                          {c.v}
                        </span>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                          {c.sub}
                        </span>
                      </div>
                      <p className="mt-2 text-[11px] leading-[1.55] text-zinc-600">{c.d}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[10px] italic text-zinc-500">
                  AMC is optional and billed separately from this proposal. Post-launch warranty terms are
                  covered in the Terms &amp; Conditions section.
                </p>
              </div>
            </div>
          </Page>
        )}

        {/* ════════════════════════════════════════════
            TERMS & CONDITIONS
            Includes a plain-English summary up top — reduces legal anxiety
            and shortens the path to signature.
            ════════════════════════════════════════════ */}
        {showTerms && (() => {
          // Section number assigned once; "continued" pages share it so the
          // contents page numbering stays clean.
          const termSecNumber = secNum();
          return termPages.map((pageClauses, pageIndex) => {
            const isFirst = pageIndex === 0;
            return (
              <Page
                key={`terms-${pageIndex}`}
                pageNumber={next()}
                totalPages={pageCount}
                org={org}
                doc={doc}
                documentTitle={documentTitle}
              >
                <div className={`flex flex-1 flex-col ${PAD_X} pt-8 pb-6`}>
                  <SectionHead
                    number={termSecNumber}
                    title={isFirst ? "Terms & Conditions" : "Terms & Conditions · continued"}
                    subtitle={
                      isFirst
                        ? "The fine print, in plain English"
                        : `Clauses ${pageClauses[0].idx}–${pageClauses[pageClauses.length - 1].idx}`
                    }
                  />
                  <SectionRule />

                  {isFirst && (
                    <div className="mt-6 border border-zinc-200 bg-zinc-50 px-5 py-4">
                      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">
                        Plain English summary
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12px] leading-[1.55] text-zinc-700">
                        <div className="flex items-start gap-2">
                          <span className="font-bold text-zinc-900">→</span>
                          <span>You own the IP after final payment</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="font-bold text-zinc-900">→</span>
                          <span>Both sides keep things confidential</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="font-bold text-zinc-900">→</span>
                          <span>Scope changes go to writing first</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="font-bold text-zinc-900">→</span>
                          <span>Either side can exit with notice</span>
                        </div>
                      </div>
                      <p className="mt-3 text-[10px] italic text-zinc-500">
                        The full numbered clauses below take precedence over this summary if there's any conflict.
                      </p>
                    </div>
                  )}

                  <ol className="mt-7 space-y-5">
                    {pageClauses.map((t) => (
                      <li key={t.idx} className="grid grid-cols-12 gap-4">
                        <div className="col-span-1 text-[14px] font-bold tabular-nums text-zinc-400">
                          {String(t.idx).padStart(2, "0")}
                        </div>
                        <div className="col-span-11">
                          <div className="text-[13px] font-bold uppercase tracking-wide text-zinc-900">
                            {t.heading}
                          </div>
                          <p className="mt-1 text-[12px] leading-[1.7] text-zinc-600">{t.body}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              </Page>
            );
          });
        })()}

        {/* ════════════════════════════════════════════
            ACCEPTANCE / NEXT STEPS — conversion-focused close
            Psychology: commitment ladder + scarcity + reciprocity
            ════════════════════════════════════════════ */}
        <Page pageNumber={next()} totalPages={pageCount} org={org} doc={doc} documentTitle={documentTitle}>
          <div className={`flex flex-1 flex-col ${PAD_X} pt-8 pb-6`}>
            <SectionHead number={secNum()} title="Accept & Begin" subtitle="From signature to live work in 72 hours" />
            <SectionRule />

            {/* What you get when you sign — value anchor before signature */}
            <div className="mt-6 border-2 border-zinc-900 px-6 py-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-zinc-500">
                When you sign today
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-8 gap-y-2.5 text-[12px] leading-[1.5] text-zinc-800">
                <div className="flex items-baseline gap-2">
                  <span className="font-bold text-zinc-900">✓</span>
                  <span>Start date locked within 72 hours of acceptance</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-bold text-zinc-900">✓</span>
                  <span>Dedicated project lead &amp; weekly demo cadence</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-bold text-zinc-900">✓</span>
                  <span>Fixed scope, milestone-based billing, no surprises</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-bold text-zinc-900">✓</span>
                  <span>Full IP ownership transferred on final payment</span>
                </div>
              </div>
            </div>

            {/* Commitment ladder — small yes → big yes */}
            <div className="mt-6">
              <div className="text-[12px] font-bold uppercase tracking-[0.18em] text-zinc-900">Three steps to kickoff</div>
              <div className="mt-3 grid grid-cols-3 gap-3">
                {[
                  { n: "01", t: "Accept", b: `Sign below and return to ${orgEmail || "us"}. Takes 60 seconds.` },
                  { n: "02", t: "Audit kickoff", b: "Within 72 hours we kick off the audit, confirm scope, and share project access." },
                  { n: "03", t: "First demo", b: "Working software in your environment by the end of the first sprint." },
                ].map((s) => (
                  <div key={s.n} className="flex flex-col border border-zinc-200 p-4">
                    <div className="text-[24px] font-extrabold leading-none tabular-nums text-zinc-900">{s.n}</div>
                    <div className="mt-3 text-[12px] font-bold uppercase tracking-wide text-zinc-900">{s.t}</div>
                    <p className="mt-1 text-[11px] leading-[1.55] text-zinc-600">{s.b}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Scarcity reminder */}
            {formattedValid && (
              <div className="mt-5 flex items-center justify-between border border-zinc-300 bg-zinc-50 px-5 py-3">
                <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-700">
                  <span className="font-bold text-zinc-900">This proposal is valid until {formattedValid}</span>
                </div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                  Pricing & scope re-quoted thereafter
                </div>
              </div>
            )}

            {/* Signature blocks — or digital-acceptance stamp if accepted via portal */}
            <div className="mt-6">
              <div className="text-[12px] font-bold uppercase tracking-[0.18em] text-zinc-900">Signatures</div>
              <div className="mt-3 grid grid-cols-2 gap-4">
                {doc.acceptance && doc.acceptance.decision === "ACCEPTED" ? (
                  <div className="border-2 border-emerald-600 bg-emerald-50 px-5 py-5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-700">
                      Digitally accepted via portal
                    </div>
                    <div className="mt-4 text-[14px] font-bold text-zinc-900">
                      {doc.acceptance.contact?.name ?? doc.acceptance.contact?.email ?? doc.clientName ?? "—"}
                    </div>
                    {doc.acceptance.contact?.email && doc.acceptance.contact?.name && (
                      <div className="text-[11px] text-zinc-600">{doc.acceptance.contact.email}</div>
                    )}
                    <div className="mt-3 border-t border-emerald-300 pt-2 text-[11px] text-zinc-700">
                      Accepted on {new Date(doc.acceptance.decidedAt).toLocaleString("en-GB")}
                    </div>
                    {doc.acceptance.ip && (
                      <div className="text-[10px] text-zinc-500">From {doc.acceptance.ip}</div>
                    )}
                    {doc.acceptance.note && (
                      <div className="mt-2 text-[11px] italic text-zinc-700">&ldquo;{doc.acceptance.note}&rdquo;</div>
                    )}
                  </div>
                ) : doc.acceptance && doc.acceptance.decision === "REJECTED" ? (
                  <div className="border-2 border-rose-600 bg-rose-50 px-5 py-5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-rose-700">
                      Declined via portal
                    </div>
                    <div className="mt-4 text-[14px] font-bold text-zinc-900">
                      {doc.acceptance.contact?.name ?? doc.acceptance.contact?.email ?? doc.clientName ?? "—"}
                    </div>
                    <div className="mt-3 border-t border-rose-300 pt-2 text-[11px] text-zinc-700">
                      Declined on {new Date(doc.acceptance.decidedAt).toLocaleString("en-GB")}
                    </div>
                    {doc.acceptance.note && (
                      <div className="mt-2 text-[11px] italic text-zinc-700">&ldquo;{doc.acceptance.note}&rdquo;</div>
                    )}
                  </div>
                ) : (
                  <div className="border border-zinc-300 px-5 py-5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">For the client</div>
                    <div className="mt-10 border-t border-zinc-400 pt-2">
                      <div className="text-[13px] font-bold text-zinc-900">{doc.clientName ?? "—"}</div>
                      <div className="text-[10px] text-zinc-500">Signature &amp; date</div>
                    </div>
                  </div>
                )}
                <div className="px-5 py-5 text-white" style={{ backgroundColor: BLACK }}>
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-400">For {org?.legalName ?? orgName}</div>
                  <div className="mt-10 border-t border-zinc-500 pt-2">
                    <div className="text-[13px] font-bold text-white">{org?.ceoName ?? doc.preparedBy ?? "Authorised Signatory"}</div>
                    <div className="text-[10px] text-zinc-400">Signature &amp; date</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1" />

            {/* Closing line — Nuro 7 brand voice ("Make Your Business 100X Faster") */}
            <div className="mt-6 border-t-2 border-zinc-900 pt-4 text-center">
              <div className="text-[20px] font-extrabold tracking-tight text-zinc-900">
                Let's make your business measurably faster.
              </div>
              <div className="mt-1 text-[11px] text-zinc-500">
                {[orgWebsite, orgEmail, orgPhone].filter(Boolean).join("  ·  ")}
              </div>
            </div>
          </div>
        </Page>
      </div>
    </>
  );
}
