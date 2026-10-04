"use client";

/**
 * Portal requests list. Linked from the dashboard "Open requests" KPI and
 * accessible via direct URL (the route stayed live after Requests was
 * dropped from the main nav). The floating chat widget is the primary
 * surface for new conversations; this page is the long-form list for
 * clients who want filter / scan / browse.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MessagesSquare, Plus, Inbox } from "lucide-react";
import { portalApi } from "@/lib/portal-api";

interface PortalRequest {
  id: string;
  title: string;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" | string;
  updatedAt: string;
  // Some backends include a lastMessage preview — used opportunistically.
  lastMessage?: { body: string; createdAt: string } | null;
}

const STATUS_PILL: Record<string, { label: string; bg: string; text: string }> = {
  OPEN:        { label: "Open",        bg: "#fef3c7", text: "#92400e" },
  IN_PROGRESS: { label: "In progress", bg: "#dbeafe", text: "#1e40af" },
  RESOLVED:    { label: "Resolved",    bg: "#d1fae5", text: "#065f46" },
  CLOSED:      { label: "Closed",      bg: "#e2e8f0", text: "#475569" },
};

const FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "All" },
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
];

function rowTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
    }
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    const diffDays = Math.round((now.getTime() - d.getTime()) / 86400000);
    if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
    return d.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "2-digit" });
  } catch {
    return "";
  }
}

export default function PortalRequests() {
  const [rows, setRows] = useState<PortalRequest[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    portalApi.requests.list(status || undefined)
      .then((data) => setRows(data as PortalRequest[]))
      .finally(() => setLoading(false));
  }, [status]);

  const sorted = useMemo(
    () => rows.slice().sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [rows],
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="portal-title text-[22px] sm:text-[28px] md:text-[34px]">Requests</h1>
          <p className="mt-2 max-w-xl text-[13px] sm:text-[14px]" style={{ color: "var(--ink-soft)" }}>
            Anything you want changed, clarified, or chased — drop it here. Your team is notified instantly.
          </p>
        </div>
        <Link href="/portal/requests/new" className="portal-cta portal-cta-accent">
          <Plus className="size-3.5" /> New request
        </Link>
      </header>
      <div className="portal-hairline" />

      {/* Filter chips — horizontal scroll on mobile so they never wrap and
          push the New button below them. */}
      <div className="-mx-4 overflow-x-auto sm:mx-0">
        <div className="flex min-w-max items-center gap-1 px-4 sm:min-w-0 sm:px-0">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatus(f.value)}
              className="portal-nav-item whitespace-nowrap"
              data-active={status === f.value}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="portal-card p-8 text-center text-[13px] sm:p-10" style={{ color: "var(--muted)" }}>
          Loading…
        </div>
      ) : sorted.length === 0 ? (
        <div className="portal-card flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-full" style={{ background: "var(--paper-2)" }}>
            <Inbox className="size-5" style={{ color: "var(--muted-2)" }} />
          </div>
          <p className="portal-title mt-2 text-[16px] sm:text-[18px]">
            {status ? "No requests in this filter." : "Nothing on file yet."}
          </p>
          <p className="max-w-xs text-[13px]" style={{ color: "var(--muted)" }}>
            {status
              ? "Try another status to find what you're looking for."
              : "Start a thread and your team will pick it up. You can also tap the chat bubble bottom-right."}
          </p>
          {!status && (
            <Link href="/portal/requests/new" className="portal-cta portal-cta-accent mt-2">
              <Plus className="size-3.5" /> Submit a request
            </Link>
          )}
        </div>
      ) : (
        <ul className="portal-card divide-y" style={{ borderColor: "var(--rule)" }}>
          {sorted.map((r) => {
            const pill = STATUS_PILL[r.status] ?? { label: r.status, bg: "#e2e8f0", text: "#475569" };
            const preview = r.lastMessage?.body ?? "Tap to view the conversation.";
            return (
              <li key={r.id} style={{ borderColor: "var(--rule-soft)" }}>
                <Link
                  href={`/portal/requests/${r.id}`}
                  className="group flex items-center gap-3 px-4 py-3.5 transition hover:bg-[var(--paper-2)] sm:gap-4 sm:px-5 sm:py-4"
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full sm:size-11" style={{ background: "var(--paper-2)" }}>
                    <MessagesSquare className="size-4" style={{ color: "var(--muted-2)" }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[14px] font-semibold sm:text-[15px]" style={{ color: "var(--ink)" }}>
                        {r.title || "Untitled request"}
                      </span>
                      <span className="shrink-0 text-[10px] tabular-nums sm:text-[11px]" style={{ color: "var(--muted)" }}>
                        {rowTime(r.updatedAt)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: "var(--muted)" }}>
                        {preview}
                      </span>
                      <span
                        className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold sm:px-2.5"
                        style={{ background: pill.bg, color: pill.text }}
                      >
                        <span className="size-1 rounded-full" style={{ background: pill.text }} />
                        {pill.label}
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
