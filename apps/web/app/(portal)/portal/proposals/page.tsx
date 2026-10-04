"use client";
import { useState } from "react";
import Link from "next/link";
import { Sparkles, ArrowUpRight } from "lucide-react";
import { portalApi } from "@/lib/portal-api";
import { usePortalRefresh } from "@/lib/hooks/use-portal-refresh";

interface PortalProposal {
  id: string;
  title: string;
  status: string;
  sentAt: string | null;
  validUntil: string | null;
}

const STATUS_TONE: Record<string, string> = {
  DRAFT:    "var(--muted)",
  SENT:     "var(--sky)",
  ACCEPTED: "var(--emerald)",
  REJECTED: "var(--rose)",
  EXPIRED:  "var(--muted-2)",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function PortalProposals() {
  const [rows, setRows] = useState<PortalProposal[]>([]);
  const [loading, setLoading] = useState(true);

  usePortalRefresh(() => {
    setLoading(true);
    return portalApi.proposals.list()
      .then((data) => setRows(data as PortalProposal[]))
      .finally(() => setLoading(false));
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="portal-title text-[22px] sm:text-[28px] md:text-[34px]">Proposals</h1>
        <p className="mt-2 max-w-xl text-[13px] sm:text-[14px]" style={{ color: "var(--ink-soft)" }}>
          Scopes, costs, timelines. Open one to review and accept — or push back with notes.
        </p>
      </header>
      <div className="portal-hairline" />

      {loading ? (
        <div className="portal-card p-10 text-center text-[13px]" style={{ color: "var(--muted)" }}>
          Loading proposals…
        </div>
      ) : rows.length === 0 ? (
        <div className="portal-card p-12 text-center">
          <Sparkles className="mx-auto size-7" style={{ color: "var(--muted-2)" }} />
          <p className="portal-title mt-4 text-[18px]">No proposals on file yet.</p>
          <p className="mt-1 text-[13px]" style={{ color: "var(--muted)" }}>
            New ones will appear here as we share them with you.
          </p>
        </div>
      ) : (
        <ul className="portal-card divide-y" style={{ borderColor: "var(--rule)" }}>
          {rows.map((p) => (
            <li key={p.id} style={{ borderColor: "var(--rule-soft)" }}>
              {/* Single status pill (was two side-by-side with `sm:hidden` /
                  `hidden sm:inline-flex`, but .portal-pill's `display:
                  inline-flex` overrode the Tailwind responsive utilities,
                  rendering both pills on desktop). Now one pill that sits
                  at the row's right edge at every size. */}
              <Link
                href={`/portal/proposals/${p.id}`}
                className="group flex items-center gap-3 px-4 py-4 transition hover:bg-[var(--paper-2)] sm:gap-4 sm:px-5"
              >
                <div className="min-w-0 flex-1">
                  <div
                    className="line-clamp-2 text-[14px] font-semibold sm:text-[15px]"
                    style={{ color: "var(--ink)" }}
                  >
                    {p.title}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" style={{ color: "var(--muted)" }}>
                    {p.sentAt && <span className="portal-eyebrow">Sent {fmtDate(p.sentAt)}</span>}
                    {p.validUntil && <span className="portal-eyebrow">Valid until {fmtDate(p.validUntil)}</span>}
                  </div>
                </div>
                <span
                  className="portal-pill shrink-0"
                  style={{ color: STATUS_TONE[p.status] ?? "var(--muted)" }}
                >
                  <span className="dot" /> {p.status}
                </span>
                <ArrowUpRight
                  className="hidden size-4 shrink-0 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 sm:block"
                  style={{ color: "var(--muted-2)" }}
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
