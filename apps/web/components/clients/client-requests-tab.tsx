"use client";

/**
 * Client Requests tab — support-style inbox with a left rail of requests
 * and a right pane that renders the request as a chat conversation.
 *
 * Visually mirrors the team chat surface: client messages on the left in a
 * white bubble, staff replies on the right in green. The status pill in the
 * header doubles as a dropdown so the assignee can flip OPEN → IN_PROGRESS
 * → RESOLVED → CLOSED inline.
 */

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Inbox, Send, CheckCheck, MessageCircle, ChevronDown } from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type Status = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

type RequestRow = {
  id: string;
  title: string;
  status: Status;
  projectId: string | null;
  updatedAt: string;
};

type Message = {
  id: string;
  body: string;
  createdAt: string;
  authorContactId: string | null;
  authorUserId: string | null;
  authorContact: { id: string; name: string | null } | null;
  authorUser: { id: string; firstName: string; lastName: string } | null;
};

type RequestDetail = {
  id: string;
  title: string;
  body: string;
  status: Status;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string | null; email: string };
  messages: Message[];
};

const STATUS_META: Record<Status, { label: string; pill: string; dot: string }> = {
  OPEN: {
    label: "Open",
    pill: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  IN_PROGRESS: {
    label: "In progress",
    pill: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300",
    dot: "bg-blue-500",
  },
  RESOLVED: {
    label: "Resolved",
    pill: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  CLOSED: {
    label: "Closed",
    pill: "bg-slate-200 text-slate-700 dark:bg-slate-700/40 dark:text-slate-300",
    dot: "bg-slate-400",
  },
};

function clockTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return "";
  }
}

function rowTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return clockTime(iso);
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

function initialsOf(name?: string | null, email?: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
  }
  return (email?.[0] ?? "?").toUpperCase();
}

export function ClientRequestsTab({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<RequestDetail | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const loadList = async () => {
    const data = await apiFetch<RequestRow[]>(`/client-requests?clientId=${clientId}`).catch(() => []);
    setRows(data);
  };

  const loadDetail = async (id: string) => {
    const data = await apiFetch<RequestDetail>(`/client-requests/${id}`).catch(() => null);
    setSelected(data);
  };

  useEffect(() => {
    void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setSelected(null);
  }, [selectedId]);

  // Auto-scroll to bottom whenever the conversation grows so the latest
  // exchange is in view without the staff member having to scroll.
  useEffect(() => {
    if (!selected) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [selected]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected || !reply.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/client-requests/${selected.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: reply.trim() }),
      });
      setReply("");
      await loadDetail(selected.id);
      await loadList();
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (status: Status) => {
    if (!selected) return;
    await apiFetch(`/client-requests/${selected.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    await loadDetail(selected.id);
    await loadList();
  };

  // Build a combined timeline: the original request body becomes the first
  // "client message", followed by all reply messages in chronological order.
  // Lets us render everything as a uniform bubble stream.
  const timeline = useMemo(() => {
    if (!selected) return [] as Array<{ id: string; isStaff: boolean; authorLabel: string; body: string; createdAt: string }>;
    const original = {
      id: `original-${selected.id}`,
      isStaff: false,
      authorLabel: selected.createdBy.name || selected.createdBy.email,
      body: selected.body,
      createdAt: selected.createdAt,
    };
    const msgs = selected.messages.map((m) => {
      const isStaff = m.authorUserId != null;
      const authorLabel = isStaff
        ? m.authorUser
          ? `${m.authorUser.firstName} ${m.authorUser.lastName}`.trim() || "Team"
          : "Team"
        : m.authorContact?.name || selected.createdBy.name || selected.createdBy.email;
      return { id: m.id, isStaff, authorLabel, body: m.body, createdAt: m.createdAt };
    });
    return [original, ...msgs];
  }, [selected]);

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

  return (
    <Card className="overflow-hidden p-0">
      <div className="grid h-[640px] grid-cols-1 md:grid-cols-[320px_1fr]">
        {/* ────────────── Left rail ────────────── */}
        <aside className="flex flex-col border-r border-border/60">
          <div className="flex items-center justify-between border-b border-border/50 bg-white px-3 py-3 dark:bg-slate-900/40">
            <div className="flex items-center gap-2">
              <Inbox className="size-4 text-slate-500" />
              <span className="text-sm font-semibold text-slate-900 dark:text-white">Requests</span>
              <span className="rounded-full bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800">
                {rows.length}
              </span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {rows.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-xs text-slate-400">
                <Inbox className="size-6 opacity-50" />
                <span>No requests yet.</span>
                <span className="text-[11px]">When this client submits a request through the portal it'll show up here.</span>
              </div>
            ) : (
              rows.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className={cn(
                    "flex w-full flex-col gap-1 border-b border-border/30 px-3 py-2.5 text-left transition",
                    selectedId === r.id
                      ? "bg-slate-100 dark:bg-slate-800/70"
                      : "hover:bg-slate-50 dark:hover:bg-slate-800/40",
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[14px] font-medium text-slate-900 dark:text-white">
                      {r.title || "Untitled request"}
                    </span>
                    <span className="shrink-0 text-[10px] tabular-nums text-slate-400">
                      {rowTime(r.updatedAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                        STATUS_META[r.status].pill,
                      )}
                    >
                      <span className={cn("size-1.5 rounded-full", STATUS_META[r.status].dot)} />
                      {STATUS_META[r.status].label}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* ────────────── Right pane ────────────── */}
        {selected ? (
          <section className="flex min-w-0 flex-col bg-[#efeae2] dark:bg-[#0b141a]">
            {/* Header */}
            <header className="flex items-center gap-3 border-b border-border/60 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-100">
                {initialsOf(selected.createdBy.name, selected.createdBy.email)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                  {selected.title}
                </div>
                <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                  {selected.createdBy.name
                    ? `${selected.createdBy.name} · ${selected.createdBy.email}`
                    : selected.createdBy.email}
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition hover:brightness-95",
                      STATUS_META[selected.status].pill,
                    )}
                  >
                    <span className={cn("size-1.5 rounded-full", STATUS_META[selected.status].dot)} />
                    {STATUS_META[selected.status].label}
                    <ChevronDown className="size-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {(Object.keys(STATUS_META) as Status[]).map((s) => (
                    <DropdownMenuItem key={s} onClick={() => changeStatus(s)}>
                      <span className={cn("size-2 shrink-0 rounded-full", STATUS_META[s].dot)} />
                      {STATUS_META[s].label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </header>

            {/* Conversation */}
            <div
              ref={scrollRef}
              className="flex-1 space-y-1 overflow-y-auto px-3 py-3"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(45deg, rgba(0,0,0,0.012) 0 1px, transparent 1px 12px)",
              }}
            >
              {dayBuckets.map(([key, msgs]) => (
                <div key={key} className="space-y-1.5">
                  <div className="sticky top-0 z-10 flex justify-center py-1">
                    <span className="rounded-md bg-white/95 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 shadow-sm dark:bg-slate-800/95 dark:text-slate-300">
                      {dateSeparatorLabel(msgs[0].createdAt)}
                    </span>
                  </div>
                  {msgs.map((m, idx) => {
                    const prev = idx > 0 ? msgs[idx - 1] : null;
                    const isContinuation =
                      !!prev &&
                      prev.isStaff === m.isStaff &&
                      new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
                    const showAuthor = !isContinuation;
                    return (
                      <div
                        key={m.id}
                        className={cn(
                          "flex w-full px-1",
                          m.isStaff ? "justify-end" : "justify-start",
                          isContinuation ? "mt-0.5" : "mt-1.5",
                        )}
                      >
                        <div
                          className={cn(
                            "relative max-w-[78%] rounded-lg px-3 pb-1 pt-1.5 shadow-sm",
                            m.isStaff
                              ? "bg-[#d9fdd3] text-slate-900 dark:bg-[#005c4b] dark:text-slate-50"
                              : "bg-white text-slate-900 dark:bg-[#202c33] dark:text-slate-100",
                            !isContinuation && (m.isStaff ? "rounded-tr-sm" : "rounded-tl-sm"),
                          )}
                        >
                          {showAuthor && (
                            <div
                              className={cn(
                                "mb-0.5 text-[11px] font-semibold leading-tight",
                                m.isStaff
                                  ? "text-[#0a7d6b] dark:text-[#53bdeb]"
                                  : "text-slate-500 dark:text-slate-400",
                              )}
                            >
                              {m.authorLabel}
                            </div>
                          )}
                          <div className="text-[14px] leading-snug">
                            <span className="whitespace-pre-wrap break-words">{m.body}</span>
                            <span className="float-right ml-2 mt-1 inline-flex shrink-0 items-center gap-0.5 align-bottom text-[10px] leading-none text-slate-500 dark:text-slate-300/70">
                              <span title={new Date(m.createdAt).toLocaleString()}>{clockTime(m.createdAt)}</span>
                              {m.isStaff && <CheckCheck className="size-3 text-[#53bdeb]" />}
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

            {/* Composer */}
            <div className="border-t border-border/60 bg-[#f0f2f5] px-3 py-2.5 dark:border-slate-800 dark:bg-[#202c33]">
              {selected.status === "CLOSED" ? (
                <div className="flex items-center justify-between rounded-full bg-white px-4 py-2 text-[12px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  <span>This request is closed. Re-open to reply.</span>
                  <button
                    type="button"
                    onClick={() => changeStatus("IN_PROGRESS")}
                    className="text-[11px] font-semibold text-[#008069] underline-offset-2 hover:underline dark:text-[#00a884]"
                  >
                    Re-open
                  </button>
                </div>
              ) : (
                <form onSubmit={send} className="flex items-end gap-2">
                  <div className="flex max-h-40 flex-1 items-end rounded-3xl bg-white px-4 py-2 shadow-sm focus-within:ring-2 focus-within:ring-[#008069]/30 dark:bg-[#2a3942] dark:focus-within:ring-[#00a884]/40">
                    <textarea
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void send(e as unknown as FormEvent);
                        }
                      }}
                      rows={1}
                      placeholder="Reply to client"
                      className="min-h-[24px] flex-1 resize-none border-0 bg-transparent p-0 text-sm leading-6 text-slate-800 outline-none dark:text-slate-100"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={busy || !reply.trim()}
                    className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[#008069] text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[#00a884]"
                    title="Send reply (Enter)"
                  >
                    <Send className="size-4 translate-x-px" />
                  </button>
                </form>
              )}
            </div>
          </section>
        ) : (
          <section className="flex min-w-0 items-center justify-center bg-[#f7f4ec] p-12 text-center dark:bg-[#0b141a]">
            <div className="flex flex-col items-center gap-3">
              <div className="flex size-16 items-center justify-center rounded-full bg-white text-[#008069] shadow-sm dark:bg-slate-800 dark:text-[#00a884]">
                <MessageCircle className="size-7" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-100">
                  {rows.length === 0 ? "No requests yet" : "Pick a request"}
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {rows.length === 0
                    ? "Client requests submitted from the portal will appear here."
                    : "Choose a request from the list to view the conversation."}
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </Card>
  );
}
