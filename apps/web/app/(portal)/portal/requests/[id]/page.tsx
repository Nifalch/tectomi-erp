"use client";

/**
 * Portal request thread — full-page view of a single conversation.
 * WhatsApp-style bubbles for visual parity with the floating chat widget:
 * client messages on the right in green, staff replies on the left in white,
 * date separators, status pill in the header, rounded-pill composer at
 * the bottom.
 */

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCheck, Send } from "lucide-react";
import { portalApi } from "@/lib/portal-api";

type Status = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

interface Message {
  id: string;
  body: string;
  createdAt: string;
  author: { kind: "staff" | "client"; name?: string | null };
}

interface RequestDetail {
  id: string;
  title: string;
  body: string;
  status: Status;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
}

const STATUS_PILL: Record<Status, { label: string; bg: string; text: string }> = {
  OPEN: { label: "Open", bg: "#fef3c7", text: "#92400e" },
  IN_PROGRESS: { label: "In progress", bg: "#dbeafe", text: "#1e40af" },
  RESOLVED: { label: "Resolved", bg: "#d1fae5", text: "#065f46" },
  CLOSED: { label: "Closed", bg: "#e2e8f0", text: "#475569" },
};

function clockTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return "";
  }
}

function dateSeparatorLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - day.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return day.toLocaleDateString(undefined, { weekday: "long" });
  return day.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function RequestThread() {
  const params = useParams();
  const id = String(params.id);
  const [request, setRequest] = useState<RequestDetail | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const load = () => portalApi.requests.detail(id).then((d) => setRequest(d as RequestDetail));
  useEffect(() => {
    void load();
    // Poll every 10s so staff replies surface without manual refresh.
    const t = setInterval(() => void load(), 10_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [request]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await portalApi.requests.reply(id, draft.trim());
      setDraft("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  // Build a uniform timeline: original body as the first client bubble +
  // all replies in order. Matches the staff-side requests tab so both
  // surfaces read the conversation identically.
  type TimelineItem = {
    id: string;
    isClient: boolean;
    body: string;
    createdAt: string;
    author?: { kind: "staff" | "client"; name?: string | null };
  };
  const timeline = useMemo<TimelineItem[]>(() => {
    if (!request) return [];
    const first: TimelineItem = {
      id: `original-${request.id}`,
      isClient: true,
      body: request.body,
      createdAt: request.createdAt,
    };
    const rest: TimelineItem[] = request.messages.map((m) => ({
      id: m.id,
      isClient: m.author.kind === "client",
      body: m.body,
      createdAt: m.createdAt,
      author: m.author,
    }));
    return [first, ...rest];
  }, [request]);

  const dayBuckets = useMemo(() => {
    const map = new Map<string, typeof timeline>();
    for (const m of timeline) {
      const k = new Date(m.createdAt).toISOString().slice(0, 10);
      const arr = map.get(k) ?? [];
      arr.push(m);
      map.set(k, arr);
    }
    return Array.from(map.entries());
  }, [timeline]);

  if (!request) {
    return (
      <p className="py-12 text-center text-sm" style={{ color: "var(--muted)" }}>
        Loading conversation…
      </p>
    );
  }

  const pill = STATUS_PILL[request.status];

  return (
    <div className="space-y-4">
      <Link href="/portal/requests" className="portal-eyebrow inline-flex items-center gap-1.5 hover:opacity-70">
        <ArrowLeft className="size-3" /> All requests
      </Link>

      <div
        className="flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm"
        style={{ borderColor: "var(--rule)", height: "calc(100vh - 220px)", minHeight: 480 }}
      >
        {/* Header */}
        <header
          className="flex items-center gap-3 border-b px-5 py-3"
          style={{ borderColor: "var(--rule)" }}
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold" style={{ color: "var(--ink)" }}>
              {request.title}
            </div>
            <div className="mt-0.5 text-[11px]" style={{ color: "var(--muted)" }}>
              Opened {new Date(request.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
            </div>
          </div>
          <span
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold"
            style={{ background: pill.bg, color: pill.text }}
          >
            <span className="size-1.5 rounded-full" style={{ background: pill.text }} />
            {pill.label}
          </span>
        </header>

        {/* Conversation */}
        <div
          ref={scrollRef}
          className="relative flex-1 overflow-y-auto px-3 py-4"
          style={{
            background: "#efeae2",
            backgroundImage:
              "repeating-linear-gradient(45deg, rgba(0,0,0,0.012) 0 1px, transparent 1px 12px)",
          }}
        >
          <div className="space-y-2">
            {dayBuckets.map(([key, msgs]) => (
              <div key={key} className="space-y-1">
                <div className="sticky top-0 z-10 flex justify-center py-1">
                  <span className="rounded-md bg-white/95 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 shadow-sm">
                    {dateSeparatorLabel(msgs[0].createdAt)}
                  </span>
                </div>
                {msgs.map((m, idx) => {
                  const prev = idx > 0 ? msgs[idx - 1] : null;
                  const isContinuation =
                    !!prev &&
                    prev.isClient === m.isClient &&
                    new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
                  const showAuthor = !isContinuation && !m.isClient;
                  return (
                    <div
                      key={m.id}
                      className={`flex w-full px-1 ${m.isClient ? "justify-end" : "justify-start"} ${
                        isContinuation ? "mt-0.5" : "mt-1.5"
                      }`}
                    >
                      <div
                        className="relative max-w-[75%] rounded-lg px-3 pb-1 pt-1.5 shadow-sm"
                        style={{
                          background: m.isClient ? "#d9fdd3" : "#ffffff",
                          color: "#1e293b",
                          borderTopRightRadius: !isContinuation && m.isClient ? "0.125rem" : undefined,
                          borderTopLeftRadius: !isContinuation && !m.isClient ? "0.125rem" : undefined,
                        }}
                      >
                        {showAuthor && (
                          <div className="mb-0.5 text-[11px] font-semibold leading-tight" style={{ color: "#0a7d6b" }}>
                            {m.author?.name ?? "Team"}
                          </div>
                        )}
                        <div className="text-[14px] leading-snug">
                          <span className="whitespace-pre-wrap break-words">{m.body}</span>
                          <span className="float-right ml-2 mt-1 inline-flex shrink-0 items-center gap-0.5 align-bottom text-[10px] leading-none text-slate-500">
                            <span title={new Date(m.createdAt).toLocaleString()}>{clockTime(m.createdAt)}</span>
                            {m.isClient && <CheckCheck className="size-3" style={{ color: "#53bdeb" }} />}
                          </span>
                          <span className="clear-both block" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Composer */}
        <div className="border-t px-3 py-2.5" style={{ borderColor: "var(--rule)", background: "#f0f2f5" }}>
          {request.status === "CLOSED" ? (
            <div className="rounded-full bg-white px-4 py-2 text-center text-[12px] text-slate-500 shadow-sm">
              This conversation is closed. Start a new one from the requests list.
            </div>
          ) : (
            <form onSubmit={send} className="flex items-end gap-2">
              <div className="flex max-h-40 flex-1 items-end rounded-3xl bg-white px-4 py-2 shadow-sm focus-within:ring-2 focus-within:ring-[#008069]/30">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send(e as unknown as FormEvent);
                    }
                  }}
                  rows={1}
                  placeholder="Type a message"
                  className="min-h-[24px] flex-1 resize-none border-0 bg-transparent p-0 text-sm leading-6 text-slate-800 outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={busy || !draft.trim()}
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[#008069] text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                title="Send (Enter)"
              >
                <Send className="size-4 translate-x-px" />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
