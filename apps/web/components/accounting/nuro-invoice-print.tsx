"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Globe, Mail, Phone, Download } from "lucide-react";
import QRCode from "react-qr-code";
import { formatCurrency } from "@/lib/utils";

export interface NuroInvoiceData {
  /** Switches headline + labels. "ESTIMATE" hides UPI QR and payment rows. */
  documentType?: "INVOICE" | "ESTIMATE";
  number: string;
  /** Optional PO / reference number printed near the invoice number. */
  referenceNumber?: string;
  /** Invoice status — when "PAID" / "OVERDUE" / "VOID" a diagonal watermark is rendered. */
  status?: string;
  issueDate?: string;
  /** For invoices = due date; for estimates = valid-until date. */
  dueDate?: string;
  /** Project name shown under "PROJECT:" */
  projectName?: string;
  /** Client display name shown under "INVOICE FOR:" */
  clientName?: string;
  /** Company name (legal entity) shown beneath the contact-person name. */
  clientCompany?: string;
  /** Multi-line client address. */
  clientAddress?: string;
  clientEmail?: string;
  clientPhone?: string;
  /** Line items rendered in the table body. */
  items: Array<{
    description?: string;
    /** Numeric quantity — shown in PROJECT DURATION column when no `duration` text is set. */
    quantity?: number;
    /** Free-text duration (e.g. "2-3 days"). Takes precedence over `quantity` for display. */
    duration?: string;
    price?: number;
    amount?: number;
  }>;
  subtotal?: number;
  tax?: number;
  discount?: number;
  total?: number;
  /** Sum of payments allocated to this invoice. Shown as PAYMENT RECEIVED row. */
  paidAmount?: number;
  /** Outstanding balance (typically total - paidAmount). Shown as BALANCE TOTAL row. */
  balanceTotal?: number;
  /** Optional advance amount due now — shown under BALANCE TOTAL as "ADV:" */
  advance?: number;
  /** Optional single-line footnote rendered between the totals card and the bulleted NOTES list. */
  leadNote?: string;
  notes?: string;
  /** Bullet-list of clauses; preferred over `notes` for rendering as the lower NOTES section. */
  notesItems?: string[];
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
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountHolder?: string;
  bankBranch?: string;
  bankIfsc?: string;
  bankUpi?: string;
  stampUrl?: string;
  /** Standard T&C clauses applied to every invoice — one per line in OrgSettings → Invoice Terms. */
  invoiceTerms?: string;
}

function joinAddress(o: NuroOrgInfo): string {
  // Formats to match the brand reference:
  //   Address line 1
  //   Address line 2 (optional)
  //   City, State - Postal
  // Country is intentionally omitted — local-default; reference template doesn't include it.
  const cityLine = [
    [o.city, o.state].filter(Boolean).join(", "),
    o.postalCode,
  ]
    .filter(Boolean)
    .join(" - ");
  return [o.addressLine1, o.addressLine2, cityLine].filter(Boolean).join("\n");
}

export function NuroInvoicePrint({ doc, org }: { doc: NuroInvoiceData; org?: NuroOrgInfo }) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const downloadPdf = async () => {
    if (!sheetRef.current || downloading) return;
    setDownloading(true);
    try {
      // Lazy-import the heavy libs only when user actually clicks Download
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas-pro"),
        import("jspdf"),
      ]);
      const node = sheetRef.current;

      // Force every <img> to fully decode into bitmap memory before capture.
      // Without this, html2canvas-pro's cloned DOM occasionally snapshots
      // before a logo's pixels are ready, producing a blank rectangle.
      const waitForImage = async (img: HTMLImageElement) => {
        if (!(img.complete && img.naturalWidth > 0)) {
          await new Promise<void>((resolve) => {
            const finish = () => resolve();
            img.addEventListener("load", finish, { once: true });
            img.addEventListener("error", finish, { once: true });
          });
        }
        try { await img.decode(); } catch { /* decode unsupported / failed */ }
      };
      await Promise.all(
        Array.from(node.querySelectorAll<HTMLImageElement>("img")).map(waitForImage),
      );

      // Scale 3 (≈300 DPI on A4) + JPEG 0.95 → print-quality output. File
      // grows to 1–2 MB for a one-page invoice, acceptable for sales material.
      const canvas = await html2canvas(node, {
        scale: 3,
        backgroundColor: "#ffffff",
        useCORS: true,
        allowTaint: false,
        logging: false,
        imageTimeout: 0,
        letterRendering: true,
        onclone: async (_doc: Document, cloned: HTMLElement) => {
          // Re-await decode inside the clone's iframe — its image cache is
          // separate from the main window's.
          const clonedImgs = Array.from(cloned.querySelectorAll<HTMLImageElement>("img"));
          await Promise.all(clonedImgs.map(waitForImage));
        },
      } as Parameters<typeof html2canvas>[1]);
      const imgData = canvas.toDataURL("image/jpeg", 0.95);

      // A4 portrait at 72dpi: 595 x 842 pt.
      const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const ratio = canvas.width / canvas.height;
      let imgW = pageW;
      let imgH = pageW / ratio;
      if (imgH > pageH) {
        imgH = pageH;
        imgW = pageH * ratio;
      }
      pdf.addImage(imgData, "JPEG", (pageW - imgW) / 2, (pageH - imgH) / 2, imgW, imgH, undefined, "FAST");
      const filename = `${docType === "ESTIMATE" ? "Estimate" : "Invoice"}-${doc.number || "draft"}.pdf`;
      pdf.save(filename);
    } finally {
      setDownloading(false);
    }
  };

  const docType = doc.documentType ?? "INVOICE";
  const isEstimate = docType === "ESTIMATE";
  const headline = isEstimate ? "ESTIMATE" : "INVOICE";
  const numberLabel = isEstimate ? "Estimate Number" : "Invoice Number";
  const partyLabel = isEstimate ? "ESTIMATE FOR:" : "INVOICE FOR:";
  const validityLabel = isEstimate ? "Valid Until" : "Due";

  const orgName = org?.name ?? "Tectomi ERP";
  const orgEmail = org?.email ?? "";
  const orgPhone = org?.phone ?? "";
  const orgWebsite = org?.website ?? "";
  const orgAddress = org ? joinAddress(org) : "";
  const logo = org?.logoUrl;
  const stamp = org?.stampUrl;

  // Bank lines — only render rows the user has filled in.
  const bankLines: Array<{ label: string; value: string }> = [];
  if (org?.bankName && org?.bankAccountNumber)
    bankLines.push({ label: `${org.bankName} Account Number`, value: org.bankAccountNumber });
  if (org?.bankAccountHolder)
    bankLines.push({ label: "Customer Name", value: org.bankAccountHolder });
  if (org?.bankBranch)
    bankLines.push({ label: "Branch Name", value: org.bankBranch });
  if (org?.bankIfsc)
    bankLines.push({ label: "Branch IFSC", value: org.bankIfsc });
  if (org?.bankUpi)
    bankLines.push({ label: "UPI", value: org.bankUpi });

  // Build the notes bullet list:
  // 1. Per-invoice notes first — invoice-specific context (e.g. "Payment Structure: 50/30/20",
  //    "This invoice is the Mid-project payment (30%)…")
  // 2. Org-wide standard T&C clauses follow — universal disclaimers (Late Fees, Ownership, etc.)
  const splitLines = (s: string | undefined): string[] =>
    (s ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const stdTerms = splitLines(org?.invoiceTerms);
  const invoiceNotes = doc.notesItems && doc.notesItems.length ? doc.notesItems : splitLines(doc.notes);
  const notesArr = [...invoiceNotes, ...stdTerms];

  return (
    <>
      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 0; }
          nav, aside, header.app-header, .no-print { display: none !important; }
          html, body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .nuro-print { margin: 0 !important; box-shadow: none !important; }
        }
      `}</style>

      {/* Toolbar — visible on screen only. Print intentionally removed; the
          Download PDF path is the canonical export. max-width caps the
          rule at A4 width on desktop while letting the button stretch to
          the viewport on phones (was a fixed 794px which broke layouts
          narrower than that). */}
      <div className="no-print mx-auto mt-4 flex w-full max-w-[794px] items-center justify-end gap-2 px-2 print:hidden">
        <button
          type="button"
          onClick={downloadPdf}
          disabled={downloading}
          className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          <Download className="size-4" />
          {downloading ? "Generating PDF…" : "Download PDF"}
        </button>
      </div>

      {/* A4 portrait page: 794 × 1123 px at 96dpi (210 × 297 mm).
          Use flex-col + flex-1 inside so the footer pill anchors to the bottom
          and any white space falls in the middle instead of below the footer. */}
      <div
        ref={sheetRef}
        className="nuro-print relative mx-auto my-6 flex flex-col overflow-hidden bg-white px-10 pt-16 pb-10 text-slate-900 shadow-lg print:my-0 print:shadow-none"
        style={{ width: "794px", minHeight: "1123px" }}
      >
        {/* ── STATUS WATERMARK ── sits behind content via z-index: 0 + content wrapper z-10. */}
        {doc.status && ["PAID", "OVERDUE", "VOID"].includes(doc.status.toUpperCase()) && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            style={{ zIndex: 0 }}
          >
            <span
              className="select-none text-[140px] font-extrabold tracking-[0.15em]"
              style={{
                transform: "rotate(-22deg)",
                opacity: 0.12,
                color: doc.status.toUpperCase() === "PAID"
                  ? "#059669"
                  : doc.status.toUpperCase() === "OVERDUE"
                  ? "#dc2626"
                  : "#475569",
                whiteSpace: "nowrap",
              }}
            >
              {doc.status.toUpperCase()}
            </span>
          </div>
        )}

        <div className="relative flex flex-1 flex-col" style={{ zIndex: 10 }}>
        {/* ── HEADER ── */}
        <header className="flex items-start justify-between">
          {/*
            Logo source priority:
              1. Org-uploaded logoUrl (set in /settings/organization)
              2. Bundled Nuro 7 wordmark logo at /logo-white.png — already contains "NURO 7" text
              3. (no real wordmark text duplicated here, since the logo image carries it)
          */}
          {logo ? (
            <div className="flex items-center gap-3">
              <Image src={logo} alt={orgName} width={56} height={56} className="h-14 w-14 object-contain" unoptimized />
              <span className="text-3xl font-bold tracking-tight">{orgName.toUpperCase()}</span>
            </div>
          ) : (
            <Image
              src="/logo-white.png"
              alt={orgName}
              width={320}
              height={80}
              className="h-14 w-auto object-contain"
              unoptimized
              priority
            />
          )}
          <div className="text-5xl font-extrabold tracking-tight">{headline}</div>
        </header>

        {/* ── PROJECT / INVOICE FOR / META ── */}
        <section className="mt-10 grid grid-cols-2 gap-8">
          <div className="space-y-5">
            {doc.projectName && (
              <div>
                <div className="text-sm font-bold tracking-wide">PROJECT:</div>
                <div className="mt-1 text-slate-700">{doc.projectName}</div>
              </div>
            )}
            {(doc.clientName || doc.clientCompany) && (
              <div>
                <div className="text-sm font-bold tracking-wide">{partyLabel}</div>
                <div className="mt-1 text-sm text-slate-700">
                  {/* Contact person on first line, legal entity below, then address + contact. */}
                  {doc.clientName && <div className="font-medium">{doc.clientName}</div>}
                  {doc.clientCompany && doc.clientCompany !== doc.clientName && (
                    <div>{doc.clientCompany}</div>
                  )}
                  {doc.clientAddress && (
                    <div className="whitespace-pre-line">{doc.clientAddress}</div>
                  )}
                  {doc.clientPhone && <div>{doc.clientPhone}</div>}
                  {doc.clientEmail && <div>{doc.clientEmail}</div>}
                </div>
              </div>
            )}
          </div>
          <div className="space-y-1 text-right text-sm text-slate-700">
            <div>{numberLabel}: #{doc.number}</div>
            {doc.referenceNumber && <div>Ref: {doc.referenceNumber}</div>}
            {doc.issueDate && <div>Date: {new Date(doc.issueDate).toLocaleDateString("en-GB").replaceAll("/", "-")}</div>}
            {doc.dueDate && <div>{validityLabel}: {new Date(doc.dueDate).toLocaleDateString("en-GB").replaceAll("/", "-")}</div>}
          </div>
        </section>

        {/* ── PAYABLE TO / BANK DETAILS ── */}
        <section className="mt-10 grid grid-cols-2 gap-8">
          <div>
            <div className="text-sm font-bold tracking-wide">PAYABLE TO:</div>
            <div className="mt-2 text-sm text-slate-700">
              <div>{org?.legalName ?? orgName}</div>
              {orgAddress && <div className="whitespace-pre-line">{orgAddress}</div>}
              {orgPhone && <div>{orgPhone}</div>}
              {orgEmail && <div>{orgEmail}</div>}
              {orgWebsite && <div>{orgWebsite}</div>}
            </div>
          </div>
          {bankLines.length > 0 && (
            <div>
              <div className="text-sm font-bold tracking-wide">BANK DETAILS:</div>
              <ul className="mt-2 space-y-0.5 text-sm text-slate-700">
                {bankLines.map((l, i) => (
                  <li key={i} className="flex">
                    <span className="mr-1">•</span>
                    <span>
                      {l.label}: <span className="font-semibold">{l.value}</span>
                    </span>
                  </li>
                ))}
              </ul>
              {/* UPI QR — encodes pa (UPI ID) + pn (payee name) + tn (invoice number)
                  + am (the outstanding amount on this invoice). The client scans,
                  their UPI app shows the exact amount, they tap Pay. No retyping.
                  Skipped on estimates — no payment expected pre-signoff. */}
              {!isEstimate && org?.bankUpi && (() => {
                const amount = Number(doc.balanceTotal ?? doc.total ?? doc.subtotal ?? 0);
                const params = new URLSearchParams({
                  pa: org.bankUpi,
                  pn: org.legalName ?? orgName,
                  tn: `Invoice ${doc.number}`,
                  cu: "INR",
                });
                // UPI spec wants the amount with 2 decimals; only include when > 0.
                if (amount > 0) params.set("am", amount.toFixed(2));
                return (
                  <div className="mt-4 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="shrink-0 rounded bg-white p-1.5">
                      <QRCode value={`upi://pay?${params.toString()}`} size={68} level="M" />
                    </div>
                    <div className="text-xs text-slate-600">
                      <div className="font-bold uppercase tracking-wide text-slate-900">
                        Scan to pay{amount > 0 ? ` ${formatCurrency(amount)}` : ""}
                      </div>
                      <div className="mt-0.5">Use any UPI app</div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </section>

        {/* ── ITEMS CARD ── */}
        <section className="relative mt-10 rounded-3xl border border-slate-300 px-6 pt-6 pb-10 shadow-sm">
          {/* Black rounded header pill */}
          <div className="rounded-2xl bg-slate-900 px-6 py-4 text-white">
            <div className="grid grid-cols-12 items-center text-sm font-bold tracking-wide">
              <div className="col-span-6">ITEM DESCRIPTION</div>
              <div className="col-span-4 text-center leading-tight">
                <div>PROJECT</div>
                <div>DURATION</div>
              </div>
              <div className="col-span-2 text-right">TOTAL</div>
            </div>
          </div>

          {/* Item rows */}
          <div className="mt-6 space-y-3 px-2">
            {doc.items.length === 0 ? (
              <div className="py-4 text-sm text-slate-400">No items.</div>
            ) : (
              doc.items.map((it, i) => {
                const lineTotal = it.amount ?? (Number(it.quantity ?? 0) * Number(it.price ?? 0));
                return (
                  <div key={i} className="grid grid-cols-12 items-start gap-2 text-sm">
                    <div className="col-span-6 flex items-start gap-2 text-slate-800">
                      <span aria-hidden className="mt-1 inline-block size-1.5 shrink-0 rounded-full bg-slate-900" />
                      <span>{it.description}</span>
                    </div>
                    <div className="col-span-4 text-center text-slate-700">{it.duration?.trim() ? it.duration : (it.quantity ? String(it.quantity) : "")}</div>
                    <div className="col-span-2 text-right text-slate-700 tabular-nums">{lineTotal ? formatCurrency(lineTotal) : ""}</div>
                  </div>
                );
              })
            )}
          </div>

          {/* Totals.
              Adaptive layout:
                • Fresh invoice (paid == 0)  → single big TOTAL row. Less clutter.
                • Partial payment (paid > 0) → SUB TOTAL + PAYMENT RECEIVED (small/muted)
                                               + BALANCE TOTAL (big/bold). The client's
                                               attention goes to what's still owed. */}
          {(() => {
            const subtotal = Number(doc.subtotal ?? doc.total ?? 0);
            const discount = Number(doc.discount ?? 0);
            const afterDiscount = Math.max(0, subtotal - discount);
            const paid = Number(doc.paidAmount ?? 0);
            const balance = Number(doc.balanceTotal ?? afterDiscount - paid);
            const hasDiscount = discount > 0;
            const hasPayments = paid > 0;
            return (
          <div className="mt-10 flex items-end justify-between gap-6 px-2">
            <div className="flex-1" />
            <div className="text-right">
              {hasPayments ? (
                <>
                  <div className="grid grid-cols-2 gap-12 py-0.5 text-sm text-slate-600">
                    <span>Sub Total</span>
                    <span className="tabular-nums">{formatCurrency(subtotal)}</span>
                  </div>
                  {hasDiscount && (
                    <div className="grid grid-cols-2 gap-12 py-0.5 text-sm text-slate-600">
                      <span>Discount</span>
                      <span className="tabular-nums">− {formatCurrency(discount)}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-12 py-0.5 text-sm text-slate-600">
                    <span>Payment Received</span>
                    <span className="tabular-nums">− {formatCurrency(paid)}</span>
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-12 border-t border-slate-300 pt-2 text-lg font-extrabold">
                    <span>BALANCE TOTAL:</span>
                    <span className="tabular-nums">{formatCurrency(balance)}</span>
                  </div>
                </>
              ) : hasDiscount ? (
                <>
                  <div className="grid grid-cols-2 gap-12 py-0.5 text-sm text-slate-600">
                    <span>Sub Total</span>
                    <span className="tabular-nums">{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-12 py-0.5 text-sm text-slate-600">
                    <span>Discount</span>
                    <span className="tabular-nums">− {formatCurrency(discount)}</span>
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-12 border-t border-slate-300 pt-2 text-lg font-extrabold">
                    <span>TOTAL:</span>
                    <span className="tabular-nums">{formatCurrency(afterDiscount)}</span>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-12 py-0.5 text-lg font-extrabold">
                  <span>TOTAL:</span>
                  <span className="tabular-nums">{formatCurrency(subtotal)}</span>
                </div>
              )}
              {doc.advance != null && Number(doc.advance) > 0 && (
                <div className="grid grid-cols-2 gap-12 py-0.5 text-sm font-semibold text-slate-600">
                  <span>ADV:</span>
                  <span className="tabular-nums">{formatCurrency(Number(doc.advance))}</span>
                </div>
              )}
            </div>
            {stamp && (
              <div className="ml-6 shrink-0">
                <Image src={stamp} alt="Stamp" width={110} height={110} className="h-24 w-24 object-contain" />
              </div>
            )}
          </div>
            );
          })()}
        </section>

        {/* ── PAYMENT SCHEDULE ── shown on estimates only.
            Gives the client a clear, structured view of what they'll be billed
            and when, so there are no surprises when the invoices land. Uses the
            estimate's subtotal as the contract base. */}
        {isEstimate && (() => {
          const base = Number(doc.subtotal ?? doc.total ?? 0);
          if (base <= 0) return null;
          const schedule = [
            { label: "Advance", trigger: "On contract signing", percent: 50 },
            { label: "Milestone", trigger: "On agreed milestone delivery", percent: 30 },
            { label: "Final", trigger: "Before final handover", percent: 20 },
          ];
          return (
            <section className="mt-10">
              <div className="text-sm font-bold tracking-wide">PAYMENT SCHEDULE:</div>
              <table className="mt-3 w-full overflow-hidden rounded-xl border border-slate-300 text-sm">
                <thead className="bg-slate-900 text-white">
                  <tr>
                    <th className="px-4 py-2 text-left font-bold tracking-wide">STAGE</th>
                    <th className="px-4 py-2 text-left font-bold tracking-wide">TRIGGER</th>
                    <th className="px-4 py-2 text-right font-bold tracking-wide">%</th>
                    <th className="px-4 py-2 text-right font-bold tracking-wide">AMOUNT</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.map((s, i) => (
                    <tr key={i} className="border-t border-slate-200">
                      <td className="px-4 py-2 font-medium text-slate-800">{s.label}</td>
                      <td className="px-4 py-2 text-slate-600">{s.trigger}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-700">{s.percent}%</td>
                      <td className="px-4 py-2 text-right font-semibold tabular-nums">
                        {formatCurrency(Math.round((base * s.percent) / 100))}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate-300 bg-slate-50 font-bold">
                    <td className="px-4 py-2" colSpan={2}>Total contract value</td>
                    <td className="px-4 py-2 text-right tabular-nums">100%</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(base)}</td>
                  </tr>
                </tbody>
              </table>
            </section>
          );
        })()}

        {/* ── LEADING FOOTNOTE ── small centered asterisk note above the bulleted NOTES. */}
        {doc.leadNote && doc.leadNote.trim() && (
          <section className="mt-8 text-center text-xs italic text-slate-600">
            {doc.leadNote}
          </section>
        )}

        {/*
          NOTES — formerly a flat bullet list. Each line is typically
          "Label: body" (e.g. "Late Fees: 2% monthly penalty…") so we
          parse on the first colon and render the label in bold to make
          the section scannable instead of a wall of grey type.
          Plain lines without a colon still render as-is. Slightly
          larger text + more breathing room between items so the legal
          clauses don't look like fine print.
        */}
        {notesArr.length > 0 && (
          <section className="mt-10">
            <div className="text-sm font-bold tracking-wide text-zinc-900">NOTES</div>
            <div className="mt-1 h-px w-10 bg-zinc-300" />
            <ul className="mt-4 space-y-2 text-[11.5px] leading-relaxed text-slate-700">
              {notesArr.map((n, i) => {
                const idx = n.indexOf(":");
                const hasLabel = idx > 0 && idx < 40; // require labels to be short — otherwise the colon's mid-sentence
                const label = hasLabel ? n.slice(0, idx).trim() : null;
                const body = hasLabel ? n.slice(idx + 1).trim() : n.trim();
                return (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden className="mt-[5px] inline-block size-1 shrink-0 rounded-full bg-zinc-500" />
                    <span>
                      {label && (
                        <span className="font-semibold text-zinc-900">{label}: </span>
                      )}
                      {body}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* ── FOOTER PILL ── pinned to the bottom of the A4 sheet via mt-auto so
            any unused vertical space falls between the NOTES bullets and the
            footer, not below the document. */}
        {(orgWebsite || orgEmail || orgPhone) && (
          <footer className="mt-auto pt-10">
            <div className="flex flex-wrap items-center justify-around gap-6 rounded-full bg-slate-900 px-6 py-3 text-sm text-white">
              {orgWebsite && (
                <span className="inline-flex items-center gap-2">
                  <Globe className="size-4 opacity-80" /> {orgWebsite}
                </span>
              )}
              {orgEmail && (
                <span className="inline-flex items-center gap-2">
                  <Mail className="size-4 opacity-80" /> {orgEmail}
                </span>
              )}
              {orgPhone && (
                <span className="inline-flex items-center gap-2">
                  <Phone className="size-4 opacity-80" /> {orgPhone}
                </span>
              )}
            </div>
            <div className="mt-4 text-center text-sm font-semibold text-slate-800">
              Thank you for choosing {orgName}. We appreciate your business.
            </div>
          </footer>
        )}
        </div>
      </div>
    </>
  );
}
