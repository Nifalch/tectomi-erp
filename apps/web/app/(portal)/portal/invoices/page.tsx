"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Download, FileText, ChevronRight } from "lucide-react";
import { portalApi } from "@/lib/portal-api";
import { usePortalRefresh } from "@/lib/hooks/use-portal-refresh";

interface PortalInvoice {
  id: string;
  number: string;
  issueDate: string;
  dueDate?: string | null;
  total: number | string;
  status: string;
}

const STATUS_TONE: Record<string, string> = {
  PAID:    "var(--emerald)",
  SENT:    "var(--sky)",
  OVERDUE: "var(--rose)",
  PARTIAL: "var(--gold)",
  DRAFT:   "var(--muted)",
  VOID:    "var(--muted-2)",
};

function fmtCurrency(v: number | string): string {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function PortalInvoices() {
  const router = useRouter();
  const [rows, setRows] = useState<PortalInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  // Refetch on mount + whenever the tab regains focus / becomes visible
  // so staff "mark paid" actions surface without a hard reload.
  usePortalRefresh(() => {
    setLoading(true);
    return portalApi.invoices.list()
      .then((data) => setRows(data as PortalInvoice[]))
      .finally(() => setLoading(false));
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="portal-title text-[22px] sm:text-[28px] md:text-[34px]">Invoices</h1>
        <p className="mt-2 max-w-xl text-[13px] sm:text-[14px]" style={{ color: "var(--ink-soft)" }}>
          Tap a row to view the branded invoice or grab the PDF.
        </p>
      </header>
      <div className="portal-hairline" />

      {loading ? (
        <div className="portal-card p-10 text-center text-[13px]" style={{ color: "var(--muted)" }}>
          Loading invoices…
        </div>
      ) : rows.length === 0 ? (
        <div className="portal-card p-12 text-center">
          <FileText className="mx-auto size-7" style={{ color: "var(--muted-2)" }} />
          <p className="portal-title mt-4 text-[18px]">Nothing invoiced yet.</p>
          <p className="mt-1 text-[13px]" style={{ color: "var(--muted)" }}>
            Invoices appear here once your team issues them.
          </p>
        </div>
      ) : (
        <div className="portal-card overflow-hidden">
          <div className="hidden items-baseline border-b px-5 py-3 sm:flex" style={{ borderColor: "var(--rule-soft)" }}>
            <span className="portal-eyebrow w-24">Issued</span>
            <span className="portal-eyebrow flex-1">Number</span>
            <span className="portal-eyebrow w-24">Status</span>
            <span className="portal-eyebrow w-28 text-right">Total</span>
            <span className="w-10" />
            <span className="w-6" />
          </div>

          <ul>
            {rows.map((i, idx) => (
              // Mobile: two-line stacked layout (number+status on top,
              // date+total on bottom). Desktop: original single horizontal
              // row. Link is an absolute overlay so the Download button
              // (relative z-10) can capture its own click without nested
              // <button> hydration errors.
              <li
                key={i.id}
                className="group relative px-4 py-3.5 transition hover:bg-[var(--paper-2)] sm:flex sm:items-center sm:gap-4 sm:px-5 sm:py-4"
                style={{ borderTop: idx === 0 ? "none" : "1px solid var(--rule-soft)" }}
              >
                <Link
                  href={`/portal/invoices/${i.id}`}
                  className="absolute inset-0"
                  aria-label={`Open invoice ${i.number}`}
                />

                {/* ── Desktop date column ── */}
                <span className="portal-eyebrow hidden w-24 shrink-0 sm:block">{fmtDate(i.issueDate)}</span>

                {/* ── Mobile top row: number + status ── */}
                <div className="flex items-center justify-between gap-3 sm:hidden">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold" style={{ color: "var(--ink)" }}>
                      {i.number}
                    </div>
                  </div>
                  <span
                    className="portal-pill shrink-0"
                    style={{ color: STATUS_TONE[i.status] ?? "var(--muted)" }}
                  >
                    <span className="dot" />
                    {i.status}
                  </span>
                </div>

                {/* ── Mobile bottom row: date + total + download ── */}
                <div className="mt-1.5 flex items-center justify-between gap-2 sm:hidden">
                  <span className="portal-eyebrow">{fmtDate(i.issueDate)}</span>
                  <div className="flex items-center gap-1">
                    <span className="portal-num text-[14px] font-semibold" style={{ color: "var(--ink)" }}>
                      {fmtCurrency(i.total)}
                    </span>
                    <button
                      type="button"
                      onClick={() => router.push(`/portal/invoices/${i.id}?download=1`)}
                      className="relative z-10 ml-1 inline-flex size-9 items-center justify-center rounded-full transition active:scale-95 hover:bg-[var(--rule-soft)]"
                      style={{ color: "var(--muted-2)" }}
                      title="Download PDF"
                      aria-label="Download PDF"
                    >
                      <Download className="size-4" />
                    </button>
                  </div>
                </div>

                {/* ── Desktop body ── */}
                <div className="hidden flex-1 sm:block">
                  <div className="text-[14px] font-semibold" style={{ color: "var(--ink)" }}>
                    {i.number}
                  </div>
                  {i.dueDate && (
                    <div className="mt-0.5 text-[11px]" style={{ color: "var(--muted)" }}>
                      Due {fmtDate(i.dueDate)}
                    </div>
                  )}
                </div>
                <span className="portal-pill hidden w-24 justify-center sm:flex" style={{ color: STATUS_TONE[i.status] ?? "var(--muted)" }}>
                  <span className="dot" />
                  {i.status}
                </span>
                <span className="portal-num hidden w-28 text-right text-[15px] font-semibold sm:block" style={{ color: "var(--ink)" }}>
                  {fmtCurrency(i.total)}
                </span>
                <button
                  type="button"
                  onClick={() => router.push(`/portal/invoices/${i.id}?download=1`)}
                  className="relative z-10 hidden size-9 items-center justify-center rounded-full transition hover:bg-[var(--rule-soft)] sm:inline-flex"
                  style={{ color: "var(--muted-2)" }}
                  title="Download PDF"
                  aria-label="Download PDF"
                >
                  <Download className="size-4" />
                </button>
                <ChevronRight className="hidden size-4 shrink-0 transition group-hover:translate-x-0.5 sm:block" style={{ color: "var(--muted-2)" }} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
