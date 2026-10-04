"use client";

/**
 * Floating chat widget — docked bottom-right of the dashboard. Visual style
 * mirrors WhatsApp: green launcher button, green header, single flat list of
 * conversations sorted by most-recent activity, each row showing avatar +
 * name + last message preview + timestamp + unread badge.
 *
 * Drilling into a channel renders the shared ChatPanel without its inline
 * header (the widget header carries the channel name during chat).
 */

import { useEffect, useMemo, useState } from "react";
import {
  MessageCircle,
  X,
  Hash,
  FolderKanban,
  Users,
  ArrowLeft,
  Plus,
  Search,
} from "lucide-react";
import { ChatPanel } from "@/components/chat/chat-panel";
import {
  useChannels,
  type ChannelSummary,
} from "@/lib/api/hooks";
import { useAuthStore } from "@/lib/store/auth-store";
import { toArray, cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CreateChannelDialog,
  CreateDirectMessageDialog,
  CreateGroupChannelDialog,
} from "@/app/(dashboard)/chat/_create-dialogs";

type View = "list" | "chat";

/** WhatsApp-style relative timestamp for a channel row. */
function rowTime(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) {
      return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
    }
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const sameYesterday =
      d.getFullYear() === yesterday.getFullYear() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getDate() === yesterday.getDate();
    if (sameYesterday) return "Yesterday";
    const diffDays = Math.round((now.getTime() - d.getTime()) / 86400000);
    if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
    return d.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "2-digit" });
  } catch {
    return "";
  }
}

function initialsOf(firstName?: string | null, lastName?: string | null) {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase() || "?";
}

function previewOf(c: ChannelSummary, selfId?: string): string {
  if (!c.lastMessage) return "No messages yet";
  if (c.lastMessage.deleted) return "[message deleted]";
  const prefix = c.lastMessage.authorId === selfId ? "You: " : "";
  return prefix + c.lastMessage.content;
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [dmOpen, setDmOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);

  const userId = useAuthStore((s) => s.user?.id);
  const roles = useAuthStore((s) => s.user?.roles ?? []);
  const canCreateGlobal = roles.some((r) => r === "SUPER_ADMIN" || r === "ADMIN");

  const channelsQuery = useChannels(!!userId);
  const channels = toArray<ChannelSummary>(channelsQuery.data);

  const totalUnread = useMemo(
    () => channels.reduce((s, c) => s + (c.unreadCount ?? 0), 0),
    [channels],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("nuro-chat-widget-open") === "1") setOpen(true);
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    sessionStorage.setItem("nuro-chat-widget-open", open ? "1" : "0");
  }, [open]);

  // WhatsApp pattern: one flat list, sorted by last activity (most recent
  // first). Pinned/section headers are an explicit choice to NOT add — the
  // user wanted a clean WhatsApp copy.
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const matched = q
      ? channels.filter((c) => {
          if (c.name.toLowerCase().includes(q)) return true;
          if (c.directWith) {
            const full = `${c.directWith.firstName} ${c.directWith.lastName}`.toLowerCase();
            if (full.includes(q)) return true;
          }
          if (c.project?.name?.toLowerCase().includes(q)) return true;
          return false;
        })
      : channels;
    return matched.slice().sort((a, b) => {
      const at = new Date(a.lastMessage?.createdAt ?? a.updatedAt ?? 0).getTime();
      const bt = new Date(b.lastMessage?.createdAt ?? b.updatedAt ?? 0).getTime();
      return bt - at;
    });
  }, [channels, filter]);

  if (!userId) return null;

  const openChat = (id: string) => {
    setSelectedId(id);
    setView("chat");
  };

  const back = () => {
    setView("list");
  };

  const selectedChannel = channels.find((c) => c.id === selectedId);

  return (
    <>
      {/* Floating launcher — WhatsApp green. */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Messages"
          className="fixed bottom-5 right-5 z-40 inline-flex size-14 items-center justify-center rounded-full bg-[#008069] text-white shadow-lg transition hover:scale-105 hover:shadow-xl dark:bg-[#00a884]"
        >
          <MessageCircle className="size-6" />
          {totalUnread > 0 && (
            <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
              {totalUnread > 99 ? "99+" : totalUnread}
            </span>
          )}
        </button>
      )}

      {open && (
        <div className="fixed bottom-3 right-3 sm:bottom-5 sm:right-5 z-40 flex h-[min(600px,calc(100vh-80px))] w-[calc(100vw-24px)] sm:w-[400px] flex-col overflow-hidden rounded-2xl border border-border/60 bg-white shadow-2xl dark:bg-[#0b141a]">
          {/* Green WhatsApp header */}
          <div className="flex items-center justify-between gap-2 bg-[#008069] px-3 py-3 text-white dark:bg-[#202c33]">
            <div className="flex min-w-0 items-center gap-2">
              {view === "chat" && (
                <button
                  type="button"
                  onClick={back}
                  className="inline-flex size-8 items-center justify-center rounded-full transition hover:bg-white/15"
                  title="Back"
                >
                  <ArrowLeft className="size-4" />
                </button>
              )}
              <span className="truncate text-base font-semibold">
                {view === "chat" && selectedChannel
                  ? channelHeaderName(selectedChannel)
                  : "Chats"}
              </span>
            </div>
            <div className="flex items-center gap-0.5">
              {view === "list" && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex size-8 items-center justify-center rounded-full transition hover:bg-white/15"
                      title="New chat"
                    >
                      <Plus className="size-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {canCreateGlobal && (
                      <DropdownMenuItem onClick={() => setCreateOpen(true)}>
                        <Hash className="size-3.5" /> New channel
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => setDmOpen(true)}>
                      <MessageCircle className="size-3.5" /> New direct message
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setGroupOpen(true)}>
                      <Users className="size-3.5" /> New group
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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
          </div>

          {view === "list" ? (
            <>
              {/* Search bar — WhatsApp's flat soft-gray pill */}
              <div className="bg-white px-3 py-2 dark:bg-[#0b141a]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Search or start a new chat"
                    className="h-9 rounded-full border-transparent bg-[#f0f2f5] pl-9 text-xs focus:border-transparent focus:bg-white dark:bg-[#202c33] dark:text-slate-100 dark:focus:bg-[#2a3942]"
                  />
                </div>
              </div>

              {/* Flat conversation list */}
              <div className="flex-1 overflow-y-auto bg-white dark:bg-[#0b141a]">
                {channelsQuery.isLoading ? (
                  <p className="p-4 text-center text-xs text-slate-400">Loading chats…</p>
                ) : filtered.length === 0 ? (
                  <p className="p-6 text-center text-xs text-slate-400">
                    {filter ? "No results." : "No chats yet. Tap + to start one."}
                  </p>
                ) : (
                  filtered.map((c) => (
                    <ConversationRow
                      key={c.id}
                      channel={c}
                      selfId={userId}
                      onSelect={() => openChat(c.id)}
                    />
                  ))
                )}
              </div>
            </>
          ) : (
            selectedId && (
              <div className="min-h-0 flex-1">
                <ChatPanel channelId={selectedId} showHeader={false} />
              </div>
            )
          )}
        </div>
      )}

      <CreateChannelDialog open={createOpen} onOpenChange={setCreateOpen} />
      <CreateDirectMessageDialog
        open={dmOpen}
        onOpenChange={setDmOpen}
        onCreated={(id) => openChat(id)}
      />
      <CreateGroupChannelDialog
        open={groupOpen}
        onOpenChange={setGroupOpen}
        onCreated={(id) => openChat(id)}
      />
    </>
  );
}

function channelHeaderName(c: ChannelSummary): string {
  if (c.type === "DIRECT" && c.directWith) {
    return `${c.directWith.firstName} ${c.directWith.lastName}`.trim() || c.name;
  }
  if (c.type === "PROJECT" && c.project) {
    return `${c.project.name} · ${c.name}`;
  }
  return c.name;
}

/**
 * WhatsApp-style conversation row: round avatar on the left, name + preview
 * stacked in the middle, timestamp + unread badge stacked on the right.
 */
function ConversationRow({
  channel,
  selfId,
  onSelect,
}: {
  channel: ChannelSummary;
  selfId?: string;
  onSelect: () => void;
}) {
  const unread = (channel.unreadCount ?? 0) > 0;
  const preview = previewOf(channel, selfId);
  const time = rowTime(channel.lastMessage?.createdAt ?? channel.updatedAt);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 border-b border-border/30 px-3 py-2.5 text-left transition hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-[#202c33]"
    >
      <ConversationAvatar channel={channel} />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={cn(
              "truncate text-[14px]",
              unread
                ? "font-semibold text-slate-900 dark:text-white"
                : "font-medium text-slate-800 dark:text-slate-100",
            )}
          >
            {channel.type === "DIRECT" && channel.directWith
              ? `${channel.directWith.firstName} ${channel.directWith.lastName}`.trim() || channel.name
              : channel.name}
          </span>
          <span
            className={cn(
              "shrink-0 text-[11px] tabular-nums",
              unread ? "font-semibold text-[#008069] dark:text-[#00a884]" : "text-slate-400",
            )}
          >
            {time}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[12px]",
              unread ? "text-slate-700 dark:text-slate-200" : "text-slate-500 dark:text-slate-400",
            )}
          >
            {preview}
          </span>
          {unread && (
            <span className="inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-[#008069] px-1.5 text-[10px] font-bold text-white dark:bg-[#00a884]">
              {channel.unreadCount > 99 ? "99+" : channel.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function ConversationAvatar({ channel }: { channel: ChannelSummary }) {
  // DMs: real person initials. Channels/groups/projects: type icon inside a
  // round tile so the visual rhythm of the list stays uniform.
  if (channel.type === "DIRECT" && channel.directWith) {
    return (
      <Avatar
        initials={initialsOf(channel.directWith.firstName, channel.directWith.lastName)}
        className="size-11 shrink-0 bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-100"
      />
    );
  }
  const Icon =
    channel.type === "PROJECT" ? FolderKanban : channel.type === "GROUP" ? Users : Hash;
  return (
    <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-200">
      <Icon className="size-5" />
    </div>
  );
}
