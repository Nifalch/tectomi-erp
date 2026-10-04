"use client";

/**
 * Floating WhatsApp-style chat widget for the client portal. Lives on every
 * authenticated portal page (login/auth pages skip it via the layout guard).
 *
 * Backed by the existing `requests` endpoints — each request is treated as
 * a conversation. The "new chat" flow asks for a subject + first message
 * and POSTs to /requests; subsequent replies post to /requests/:id/messages.
 *
 * No new backend code. Polls every 8s while the panel is open so staff
 * replies surface without a manual refresh.
 */

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  MessageCircle,
  X,
  ArrowLeft,
  Plus,
  Send,
  CheckCheck,
  Search,
  Inbox,
} from "lucide-react";
import { portalApi } from "@/lib/portal-api";
import { cn } from "@/lib/utils";

type Status = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

interface ListedRequest {
  id: string;
  title: string;
  status: Status;
  updatedAt: string;
  // Some backend versions include lastMessage on list; fall back to title
  // when absent.
  lastMessage?: { body: string; createdAt: string; author?: { kind: "staff" | "client"; name?: string | null } | null } | null;
}

interface DetailMessage {
  id: string;
  body: string;
  createdAt: string;
  author: { kind: "staff" | "client"; name?: string | null };
}

interface DetailRequest {
  id: string;
  title: string;
  body: string;
  status: Status;
  createdAt: string;
  updatedAt: string;
  messages: DetailMessage[];
}

const STATUS_PILL: Record<Status, string> = {
  OPEN: "bg-amber-100 text-amber-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  RESOLVED: "bg-emerald-100 text-emerald-800",
  CLOSED: "bg-slate-200 text-slate-700",
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
    if (d.toDateString() === now.toDateString()) return clockTime(iso);
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

type View = "list" | "chat" | "new";

export function PortalChatWidget({ orgName }: { orgName?: string | null }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const [list, setList] = useState<ListedRequest[]>([]);
  const [detail, setDetail] = useState<DetailRequest | null>(null);

  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  // Inline error banner for send / create failures. Without this the
  // user has no feedback when the network drops mid-send — their draft
  // sits there with no indication that the API rejected it.
  const [sendErr, setSendErr] = useState<string | null>(null);

  // "New conversation" form state — lives at the widget level so navigation
  // between views doesn't lose what the client was typing.
  const [newSubject, setNewSubject] = useState("");
  const [newBody, setNewBody] = useState("");

  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  // Persist open state across navigations (same trick as the staff widget).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("nuro-portal-chat-open") === "1") setOpen(true);
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    sessionStorage.setItem("nuro-portal-chat-open", open ? "1" : "0");
  }, [open]);

  const loadList = async () => {
    try {
      const data = await portalApi.requests.list();
      setList(data as ListedRequest[]);
    } catch {
      /* swallow — widget stays empty rather than crashing the page */
    }
  };

  const loadDetail = async (id: string) => {
    try {
      const data = await portalApi.requests.detail(id);
      setDetail(data as DetailRequest);
    } catch {
      setDetail(null);
    }
  };

  // Polling — only while the widget panel is open. Saves bandwidth when
  // it's docked.
  useEffect(() => {
    if (!open) return;
    void loadList();
    const t = setInterval(() => {
      void loadList();
      if (selectedId) void loadDetail(selectedId);
    }, 8000);
    return () => clearInterval(t);
  }, [open, selectedId]);

  useEffect(() => {
    if (view !== "chat" || !selectedId) return;
    // Clear the previous conversation's messages immediately on switch
    // so the user doesn't see the prior thread flash in while the new
    // detail loads. Also catches the late-arriving response from a
    // poll that fired before the switch — the stale write would
    // overwrite the new conversation otherwise.
    setDetail(null);
    let cancelled = false;
    void portalApi.requests.detail(selectedId).then((d) => {
      if (!cancelled) setDetail(d as DetailRequest);
    }).catch(() => {
      if (!cancelled) setDetail(null);
    });
    return () => { cancelled = true; };
  }, [view, selectedId]);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [detail, view]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const matched = q ? list.filter((r) => r.title.toLowerCase().includes(q)) : list;
    return matched.slice().sort((a, b) => {
      const at = new Date(a.lastMessage?.createdAt ?? a.updatedAt).getTime();
      const bt = new Date(b.lastMessage?.createdAt ?? b.updatedAt).getTime();
      return bt - at;
    });
  }, [list, filter]);

  const openChat = (id: string) => {
    setSelectedId(id);
    setView("chat");
  };

  const sendReply = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedId || !reply.trim()) return;
    setBusy(true);
    setSendErr(null);
    try {
      await portalApi.requests.reply(selectedId, reply.trim());
      setReply("");
      await loadDetail(selectedId);
      await loadList();
    } catch (e) {
      setSendErr((e as Error).message ?? "Couldn't send the message. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const createConversation = async (e: FormEvent) => {
    e.preventDefault();
    const subject = newSubject.trim() || newBody.trim().slice(0, 80) || "New request";
    const body = newBody.trim();
    if (!body) return;
    setBusy(true);
    setSendErr(null);
    try {
      const created = await portalApi.requests.create({ title: subject, body });
      setNewSubject("");
      setNewBody("");
      await loadList();
      const newId = (created as { id?: string })?.id;
      if (newId) {
        setSelectedId(newId);
        setView("chat");
      } else {
        setView("list");
      }
    } catch (e) {
      setSendErr((e as Error).message ?? "Couldn't start the conversation. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const selectedListed = list.find((r) => r.id === selectedId);
  const headerTitle =
    view === "chat"
      ? selectedListed?.title ?? detail?.title ?? "Chat"
      : view === "new"
        ? "New conversation"
        : "Messages";

  // Build a uniform timeline: original request body + replies. Same trick
  // the staff-side requests tab uses so the first bubble in the thread is
  // the client's own opening message.
  const timeline = useMemo(() => {
    if (!detail) return [] as Array<DetailMessage & { isClient: boolean }>;
    const first: DetailMessage & { isClient: boolean } = {
      id: `original-${detail.id}`,
      body: detail.body,
      createdAt: detail.createdAt,
      author: { kind: "client" },
      isClient: true,
    };
    const rest = detail.messages.map((m) => ({ ...m, isClient: m.author.kind === "client" }));
    return [first, ...rest];
  }, [detail]);

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

  const orgInitial = (orgName?.[0] ?? "N").toUpperCase();

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Message your team"
          className="fixed bottom-5 right-5 z-40 inline-flex size-14 items-center justify-center rounded-full bg-[#008069] text-white shadow-lg transition hover:scale-105 hover:shadow-xl"
        >
          <MessageCircle className="size-6" />
        </button>
      )}

      {open && (
        <div className="fixed bottom-5 right-5 z-40 flex h-[600px] w-[400px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center gap-2 bg-[#008069] px-3 py-3 text-white">
            {view !== "list" && (
              <button
                type="button"
                onClick={() => {
                  setView("list");
                  setSelectedId(null);
                }}
                className="inline-flex size-8 items-center justify-center rounded-full transition hover:bg-white/15"
                title="Back"
              >
                <ArrowLeft className="size-4" />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-semibold">{headerTitle}</div>
              {view === "chat" && detail && (
                <div className="truncate text-[11px] text-white/80">
                  Status: {detail.status.replace("_", " ").toLowerCase()}
                </div>
              )}
              {view === "list" && (
                <div className="truncate text-[11px] text-white/80">
                  Chat with the {orgName ?? "Tectomi ERP"} team
                </div>
              )}
            </div>
            {view === "list" && (
              <button
                type="button"
                onClick={() => setView("new")}
                className="inline-flex size-8 items-center justify-center rounded-full transition hover:bg-white/15"
                title="New conversation"
              >
                <Plus className="size-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex size-8 items-center justify-center rounded-full transition hover:bg-white/15"
              title="Close"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Body */}
          {view === "list" && (
            <>
              <div className="bg-white px-3 py-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Search conversations"
                    className="h-9 w-full rounded-full border-transparent bg-[#f0f2f5] pl-9 pr-3 text-xs outline-none focus:bg-white focus:ring-2 focus:ring-[#008069]/30"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto bg-white">
                {filtered.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                    <Inbox className="size-7 text-slate-300" />
                    <div className="text-sm text-slate-700">
                      {filter ? "No conversations match." : "No conversations yet."}
                    </div>
                    {!filter && (
                      <button
                        type="button"
                        onClick={() => setView("new")}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[#008069] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:brightness-110"
                      >
                        <Plus className="size-3.5" /> Start a conversation
                      </button>
                    )}
                  </div>
                ) : (
                  filtered.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => openChat(r.id)}
                      className="flex w-full items-center gap-3 border-b border-slate-100 px-3 py-2.5 text-left transition hover:bg-slate-50"
                    >
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-700">
                        {orgInitial}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[14px] font-medium text-slate-900">
                            {r.title}
                          </span>
                          <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
                            {rowTime(r.lastMessage?.createdAt ?? r.updatedAt)}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center justify-between gap-2">
                          <span className="min-w-0 flex-1 truncate text-[12px] text-slate-500">
                            {r.lastMessage?.body ?? "Tap to view the conversation."}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                              STATUS_PILL[r.status],
                            )}
                          >
                            {r.status.replace("_", " ")}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </>
          )}

          {view === "new" && (
            <form
              onSubmit={createConversation}
              className="flex flex-1 flex-col bg-white p-4"
            >
              <p className="text-[12px] text-slate-500">
                Tell us what's going on. The {orgName ?? "Tectomi ERP"} team is notified instantly and you'll see their replies right here.
              </p>
              <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Subject
                <input
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  placeholder="e.g. Question about the launch timeline"
                  className="mt-1.5 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#008069] focus:ring-2 focus:ring-[#008069]/20"
                />
              </label>
              <label className="mt-3 block flex-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Message
                <textarea
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  placeholder="Type your message…"
                  rows={5}
                  className="mt-1.5 block h-[180px] w-full resize-none rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-800 outline-none focus:border-[#008069] focus:ring-2 focus:ring-[#008069]/20"
                />
              </label>
              {sendErr && (
                <p className="mt-2 text-[11px] font-medium text-rose-600">{sendErr}</p>
              )}
              <button
                type="submit"
                disabled={busy || !newBody.trim()}
                className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-full bg-[#008069] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="size-4 translate-x-px" />
                {busy ? "Sending…" : "Send"}
              </button>
            </form>
          )}

          {view === "chat" && (
            <>
              <div
                ref={chatScrollRef}
                className="relative flex-1 overflow-y-auto bg-[#efeae2] px-3 py-3"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(45deg, rgba(0,0,0,0.012) 0 1px, transparent 1px 12px)",
                }}
              >
                {!detail ? (
                  <div className="flex h-full items-center justify-center text-xs text-slate-500">
                    Loading conversation…
                  </div>
                ) : (
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
                          const showAuthor = !isContinuation;
                          // Client's own messages render on the RIGHT (green)
                          // — the opposite side from the staff-side view, but
                          // identical in style. WhatsApp parity.
                          return (
                            <div
                              key={m.id}
                              className={cn(
                                "flex w-full px-1",
                                m.isClient ? "justify-end" : "justify-start",
                                isContinuation ? "mt-0.5" : "mt-1.5",
                              )}
                            >
                              <div
                                className={cn(
                                  "relative max-w-[78%] rounded-lg px-3 pb-1 pt-1.5 shadow-sm",
                                  m.isClient
                                    ? "bg-[#d9fdd3] text-slate-900"
                                    : "bg-white text-slate-900",
                                  !isContinuation && (m.isClient ? "rounded-tr-sm" : "rounded-tl-sm"),
                                )}
                              >
                                {showAuthor && !m.isClient && (
                                  <div className="mb-0.5 text-[11px] font-semibold leading-tight text-[#0a7d6b]">
                                    {m.author?.name ?? `${orgName ?? "Tectomi ERP"} team`}
                                  </div>
                                )}
                                <div className="text-[14px] leading-snug">
                                  <span className="whitespace-pre-wrap break-words">{m.body}</span>
                                  <span className="float-right ml-2 mt-1 inline-flex shrink-0 items-center gap-0.5 align-bottom text-[10px] leading-none text-slate-500">
                                    <span title={new Date(m.createdAt).toLocaleString()}>{clockTime(m.createdAt)}</span>
                                    {m.isClient && <CheckCheck className="size-3 text-[#53bdeb]" />}
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
                )}
              </div>

              <div className="border-t border-slate-200 bg-[#f0f2f5] px-3 py-2.5">
                {sendErr && (
                  <p className="mb-2 text-[11px] font-medium text-rose-600">{sendErr}</p>
                )}
                {detail?.status === "CLOSED" ? (
                  <div className="rounded-full bg-white px-4 py-2 text-center text-[12px] text-slate-500">
                    This conversation is closed. Start a new one from the list.
                  </div>
                ) : (
                  <form onSubmit={sendReply} className="flex items-end gap-2">
                    <div className="flex max-h-40 flex-1 items-end rounded-3xl bg-white px-4 py-2 shadow-sm focus-within:ring-2 focus-within:ring-[#008069]/30">
                      <textarea
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void sendReply(e as unknown as FormEvent);
                          }
                        }}
                        rows={1}
                        placeholder="Type a message"
                        className="min-h-[24px] flex-1 resize-none border-0 bg-transparent p-0 text-sm leading-6 text-slate-800 outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={busy || !reply.trim()}
                      className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[#008069] text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                      title="Send (Enter)"
                    >
                      <Send className="size-4 translate-x-px" />
                    </button>
                  </form>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
