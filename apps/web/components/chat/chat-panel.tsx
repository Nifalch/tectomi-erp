"use client";

/**
 * WhatsApp-styled chat panel. Bubble layout, date separators, sender names on
 * incoming group messages, time and edit marker inside bubble. No attachment
 * or voice mic surfaces — they're documented as "not yet, no storage backend".
 *
 * Behaviour preserved from the previous design: poll every 5s, @mention
 * autocomplete, reactions, edit/delete, mark-read, jump-to-bottom pill.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Send, Smile, Trash2, MoreHorizontal, ArrowDown, Check, CheckCheck } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { TextArea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useChannel,
  useChannelMembers,
  useChannelMessages,
  type ChatMessageRow,
} from "@/lib/api/hooks";
import {
  useSendMessage,
  useEditMessage,
  useDeleteMessage,
  useMarkChannelRead,
  useAddReaction,
  useRemoveReaction,
} from "@/lib/api/mutations";
import { useAuthStore } from "@/lib/store/auth-store";
import { cn } from "@/lib/utils";

const QUICK_EMOJIS = ["👍", "❤️", "🎉", "😄", "🚀", "👀"];

function initialsOf(firstName?: string | null, lastName?: string | null) {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase() || "?";
}

function absoluteTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function clockTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
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
  if (diffDays < 7) {
    return day.toLocaleDateString(undefined, { weekday: "long" });
  }
  return day.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function groupByDay(messages: ChatMessageRow[]): Array<{ key: string; label: string; messages: ChatMessageRow[] }> {
  const buckets = new Map<string, ChatMessageRow[]>();
  for (const m of messages) {
    const k = new Date(m.createdAt).toISOString().slice(0, 10);
    const arr = buckets.get(k) ?? [];
    arr.push(m);
    buckets.set(k, arr);
  }
  return Array.from(buckets.entries()).map(([key, msgs]) => ({
    key,
    label: dateSeparatorLabel(msgs[0].createdAt),
    messages: msgs,
  }));
}

function renderChatContent(content: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /@([a-zA-Z][a-zA-Z0-9._-]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) parts.push(<span key={`t${key++}`}>{content.slice(last, m.index)}</span>);
    parts.push(
      <span
        key={`m${key++}`}
        className="rounded px-0.5 font-medium text-[#0a7d6b] dark:text-[#53bdeb]"
      >
        @{m[1]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < content.length) parts.push(<span key={`t${key++}`}>{content.slice(last)}</span>);
  return parts;
}

interface Props {
  channelId: string;
  showHeader?: boolean;
}

export function ChatPanel({ channelId, showHeader = true }: Props) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const roles = useAuthStore((s) => s.user?.roles ?? []);
  const isAdmin = roles.some((r) => r === "SUPER_ADMIN" || r === "ADMIN");

  const channelQuery = useChannel(channelId);
  const membersQuery = useChannelMembers(channelId);
  const messagesQuery = useChannelMessages(channelId);
  const messages = useMemo<ChatMessageRow[]>(
    () => (Array.isArray(messagesQuery.data) ? messagesQuery.data : []),
    [messagesQuery.data],
  );

  const send = useSendMessage(channelId);
  const edit = useEditMessage();
  const del = useDeleteMessage();
  const markRead = useMarkChannelRead();
  const addReaction = useAddReaction();
  const removeReaction = useRemoveReaction();

  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [showJumpDown, setShowJumpDown] = useState(false);

  const [mentionState, setMentionState] = useState<{
    start: number;
    query: string;
    highlighted: number;
  } | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const userStuckAtBottomRef = useRef(true);
  const lastSeenCount = useRef(0);

  const channel = channelQuery.data as any;
  const isDM = channel?.type === "DIRECT";
  const members = Array.isArray(membersQuery.data) ? membersQuery.data : [];

  const mentionMatches = useMemo(() => {
    if (!mentionState) return [];
    const q = mentionState.query.toLowerCase();
    return members
      .map((m: any) => m.user ?? m)
      .filter((u: any) => {
        if (!u?.firstName && !u?.lastName) return false;
        if (u.id === currentUserId) return false;
        if (!q) return true;
        const full = `${u.firstName ?? ""} ${u.lastName ?? ""}`.toLowerCase();
        return (
          full.includes(q) ||
          (u.firstName ?? "").toLowerCase().startsWith(q) ||
          (u.email ?? "").toLowerCase().startsWith(q)
        );
      })
      .slice(0, 6);
  }, [mentionState, members, currentUserId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      userStuckAtBottomRef.current = atBottom;
      setShowJumpDown(!atBottom);
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (messages.length === lastSeenCount.current) return;
    lastSeenCount.current = messages.length;
    if (userStuckAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
  }, [messages.length]);

  useEffect(() => {
    if (!channelId) return;
    markRead.mutate(channelId);
  }, [channelId, messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDraftChange = (next: string, caret: number) => {
    setDraft(next);
    let i = caret - 1;
    while (i >= 0) {
      const ch = next[i];
      if (ch === "@") {
        if (i === 0 || /\s/.test(next[i - 1] ?? "")) {
          const query = next.slice(i + 1, caret);
          if (!/\s/.test(query)) {
            setMentionState({ start: i, query, highlighted: 0 });
            return;
          }
        }
        break;
      }
      if (/\s/.test(ch)) break;
      i -= 1;
    }
    setMentionState(null);
  };

  const applyMention = (user: { id: string; firstName: string; lastName: string }) => {
    if (!mentionState) return;
    const handle = `@${user.firstName.toLowerCase()}${user.lastName ? "." + user.lastName.toLowerCase() : ""} `;
    const before = draft.slice(0, mentionState.start);
    const afterCaret = draft.slice(mentionState.start + 1 + mentionState.query.length);
    const next = before + handle + afterCaret;
    setDraft(next);
    setMentionState(null);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        const pos = before.length + handle.length;
        el.focus();
        el.setSelectionRange(pos, pos);
      }
    });
  };

  const handleComposerKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionState && mentionMatches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionState((s) =>
          s ? { ...s, highlighted: (s.highlighted + 1) % mentionMatches.length } : s,
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionState((s) =>
          s
            ? { ...s, highlighted: (s.highlighted - 1 + mentionMatches.length) % mentionMatches.length }
            : s,
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        applyMention(mentionMatches[mentionState.highlighted] as any);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionState(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    send.mutate(
      { content: trimmed },
      {
        onSuccess: () => {
          setDraft("");
          userStuckAtBottomRef.current = true;
        },
      },
    );
  };

  const handleEditSubmit = (id: string) => {
    const trimmed = editDraft.trim();
    if (!trimmed) return;
    edit.mutate(
      { id, content: trimmed, channelId },
      {
        onSuccess: () => {
          setEditingId(null);
          setEditDraft("");
        },
      },
    );
  };

  const toggleReaction = (m: ChatMessageRow, emoji: string) => {
    const mine = m.reactions.find((r) => r.emoji === emoji)?.users.includes(currentUserId ?? "");
    if (mine) removeReaction.mutate({ id: m.id, emoji, channelId });
    else addReaction.mutate({ id: m.id, emoji, channelId });
  };

  const dayGroups = groupByDay(messages);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border/60">
      {showHeader && (
        <div className="flex items-center gap-3 border-b border-border/50 bg-[#008069] px-4 py-2.5 text-white dark:bg-[#202c33]">
          <Avatar
            initials={
              isDM && channel?.directWith
                ? initialsOf(channel.directWith.firstName, channel.directWith.lastName)
                : (channel?.name?.[0] ?? "#").toUpperCase()
            }
            className="size-9 bg-white/15 text-white"
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">
              {isDM && channel?.directWith
                ? `${channel.directWith.firstName} ${channel.directWith.lastName}`.trim()
                : channel?.name ?? "…"}
            </div>
            <div className="truncate text-[11px] text-white/70">
              {channel?.type === "PROJECT"
                ? channel?.project?.name ?? "Project channel"
                : Array.isArray(channel?.members)
                  ? `${channel.members.length} members`
                  : channel?.description ?? ""}
            </div>
          </div>
        </div>
      )}

      <div
        ref={scrollRef}
        className="relative flex-1 overflow-y-auto bg-[#efeae2] px-3 py-3 dark:bg-[#0b141a]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, rgba(0,0,0,0.012) 0 1px, transparent 1px 12px)",
        }}
      >
        {messagesQuery.isLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            Loading messages…
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-white/70 text-slate-400 shadow-sm dark:bg-slate-800/60">
              💬
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400">
              <div className="font-medium text-slate-600 dark:text-slate-300">No messages yet</div>
              <div className="text-xs">Say hi to get the thread started.</div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {dayGroups.map((dg) => (
              <div key={dg.key} className="space-y-1">
                <div className="sticky top-0 z-10 flex justify-center py-1">
                  <span className="rounded-md bg-white/95 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 shadow-sm dark:bg-slate-800/95 dark:text-slate-300">
                    {dg.label}
                  </span>
                </div>

                {dg.messages.map((m, idx) => {
                  const prev = idx > 0 ? dg.messages[idx - 1] : null;
                  const isContinuation =
                    !!prev &&
                    prev.authorId === m.authorId &&
                    new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
                  return (
                    <MessageBubble
                      key={m.id}
                      m={m}
                      mine={m.authorId === currentUserId}
                      isContinuation={isContinuation}
                      isDM={isDM}
                      currentUserId={currentUserId}
                      isAdmin={isAdmin}
                      editing={editingId === m.id}
                      editDraft={editDraft}
                      setEditDraft={setEditDraft}
                      onEdit={() => {
                        setEditingId(m.id);
                        setEditDraft(m.content);
                      }}
                      onEditSubmit={() => handleEditSubmit(m.id)}
                      onEditCancel={() => {
                        setEditingId(null);
                        setEditDraft("");
                      }}
                      onDelete={() => del.mutate({ id: m.id, channelId })}
                      onReact={(emoji) => toggleReaction(m, emoji)}
                    />
                  );
                })}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}

        {showJumpDown && (
          <button
            type="button"
            onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })}
            className="sticky bottom-3 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-slate-900/90 px-3 py-1 text-[11px] font-medium text-white shadow-lg hover:opacity-90 dark:bg-slate-100/90 dark:text-slate-900"
          >
            <ArrowDown className="size-3.5" /> Jump to latest
          </button>
        )}
      </div>

      <div className="relative bg-[#f0f2f5] px-3 py-2.5 dark:bg-[#202c33]">
        {mentionState && mentionMatches.length > 0 && (
          <div className="absolute bottom-[calc(100%-4px)] left-3 right-3 z-20 overflow-hidden rounded-lg border border-border/70 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
            <div className="border-b border-border/50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Mention a teammate
            </div>
            <div className="max-h-56 overflow-y-auto py-1">
              {mentionMatches.map((u: any, idx: number) => {
                const active = idx === mentionState.highlighted;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onMouseDown={(ev) => {
                      ev.preventDefault();
                      applyMention(u);
                    }}
                    onMouseEnter={() =>
                      setMentionState((s) => (s ? { ...s, highlighted: idx } : s))
                    }
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800",
                    )}
                  >
                    <Avatar
                      initials={initialsOf(u.firstName, u.lastName)}
                      className="size-6 text-[10px]"
                    />
                    <span className="truncate">
                      {u.firstName} {u.lastName}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Composer — emoji icon removed (reactions still live on each
            bubble's hover menu). Input pill grows full-width with the send
            button next to it; no helper line under it to keep the tray slim. */}
        <div className="flex items-end gap-2">
          <div className="flex max-h-40 flex-1 items-end rounded-3xl bg-white px-4 py-2 shadow-sm focus-within:ring-2 focus-within:ring-[#008069]/30 dark:bg-[#2a3942] dark:focus-within:ring-[#00a884]/40">
            <TextArea
              ref={textareaRef}
              value={draft}
              onChange={(e) => handleDraftChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
              onKeyDown={handleComposerKey}
              onBlur={() => {
                setTimeout(() => setMentionState(null), 120);
              }}
              placeholder="Type a message"
              rows={1}
              className="min-h-[24px] flex-1 resize-none border-0 bg-transparent p-0 text-sm leading-6 text-slate-800 focus:ring-0 dark:text-slate-100"
            />
          </div>

          <button
            type="button"
            onClick={handleSend}
            disabled={!draft.trim() || send.isPending}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[#008069] text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[#00a884]"
            title="Send (Enter)"
            aria-label="Send message"
          >
            <Send className="size-4 translate-x-px" />
          </button>
        </div>
      </div>
    </div>
  );
}

interface BubbleProps {
  m: ChatMessageRow;
  mine: boolean;
  isContinuation: boolean;
  isDM: boolean;
  currentUserId?: string;
  isAdmin: boolean;
  editing: boolean;
  editDraft: string;
  setEditDraft: (v: string) => void;
  onEdit: () => void;
  onEditSubmit: () => void;
  onEditCancel: () => void;
  onDelete: () => void;
  onReact: (emoji: string) => void;
}

function MessageBubble({
  m,
  mine,
  isContinuation,
  isDM,
  currentUserId,
  isAdmin,
  editing,
  editDraft,
  setEditDraft,
  onEdit,
  onEditSubmit,
  onEditCancel,
  onDelete,
  onReact,
}: BubbleProps) {
  const isDeleted = !!m.deletedAt;
  const showSenderName = !mine && !isDM && !isContinuation;

  return (
    <div
      className={cn(
        "group flex w-full px-1",
        mine ? "justify-end" : "justify-start",
        isContinuation ? "mt-0.5" : "mt-1.5",
      )}
    >
      <div
        className={cn(
          "relative max-w-[75%] rounded-lg px-2.5 pb-1 pt-1.5 shadow-sm",
          mine
            ? "bg-[#d9fdd3] text-slate-900 dark:bg-[#005c4b] dark:text-slate-50"
            : "bg-white text-slate-900 dark:bg-[#202c33] dark:text-slate-100",
          !isContinuation && (mine ? "rounded-tr-sm" : "rounded-tl-sm"),
        )}
      >
        {showSenderName && (
          <div className="mb-0.5 text-[12px] font-semibold leading-tight text-[#0a7d6b] dark:text-[#53bdeb]">
            {m.author?.firstName} {m.author?.lastName}
          </div>
        )}

        {editing ? (
          <div className="space-y-1.5 py-0.5">
            <TextArea
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              rows={2}
              className="bg-white/80 text-sm dark:bg-slate-900/40"
            />
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={onEditSubmit}
                className="rounded-md bg-[#008069] px-2 py-1 text-[11px] font-semibold text-white hover:brightness-110 dark:bg-[#00a884]"
              >
                Save
              </button>
              <button
                type="button"
                onClick={onEditCancel}
                className="rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="text-[14px] leading-snug">
            <span
              className={cn(
                "whitespace-pre-wrap break-words",
                isDeleted && "italic text-slate-400 dark:text-slate-500",
              )}
            >
              {isDeleted ? "this message was deleted" : renderChatContent(m.content)}
            </span>
            <span className="float-right ml-2 mt-1 inline-flex shrink-0 items-center gap-0.5 align-bottom text-[10px] leading-none text-slate-500 dark:text-slate-300/70">
              {m.editedAt && !isDeleted && (
                <span title={`edited ${absoluteTime(m.editedAt)}`} className="italic">edited</span>
              )}
              <span title={absoluteTime(m.createdAt)}>{clockTime(m.createdAt)}</span>
              {mine && !isDeleted && (
                <CheckCheck className="size-3 text-[#53bdeb]" aria-label="sent" />
              )}
              {mine && isDeleted && <Check className="size-3 text-slate-400" />}
            </span>
            <span className="clear-both block" />
          </div>
        )}

        {!isDeleted && m.reactions.length > 0 && (
          <div
            className={cn(
              "mt-1 flex flex-wrap gap-1",
              mine ? "justify-end" : "justify-start",
            )}
          >
            {m.reactions.map((r) => {
              const mineReact = currentUserId ? r.users.includes(currentUserId) : false;
              return (
                <button
                  key={r.emoji}
                  type="button"
                  onClick={() => onReact(r.emoji)}
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px] transition",
                    mineReact
                      ? "border-[#008069]/40 bg-[#dcf8c6] text-[#0a7d6b] dark:border-[#00a884]/50 dark:bg-[#00a884]/15 dark:text-[#00a884]"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
                  )}
                >
                  <span>{r.emoji}</span>
                  <span>{r.count}</span>
                </button>
              );
            })}
          </div>
        )}

        {!isDeleted && !editing && (
          <div
            className={cn(
              "absolute top-0 flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100",
              mine ? "-left-16" : "-right-16",
            )}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="rounded-full bg-white p-1 text-slate-500 shadow ring-1 ring-slate-200 hover:text-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700"
                  title="React"
                >
                  <Smile className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={mine ? "end" : "start"}>
                <div className="flex gap-1 px-1">
                  {QUICK_EMOJIS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => onReact(e)}
                      className="rounded p-1 text-lg transition hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
            {(mine || isAdmin) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="rounded-full bg-white p-1 text-slate-500 shadow ring-1 ring-slate-200 hover:text-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700"
                    title="More"
                  >
                    <MoreHorizontal className="size-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align={mine ? "end" : "start"}>
                  {mine && (
                    <DropdownMenuItem onClick={onEdit}>
                      <Pencil className="size-3.5" /> Edit
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem destructive onClick={onDelete}>
                    <Trash2 className="size-3.5" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
