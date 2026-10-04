"use client";

/**
 * Team chat hub — WhatsApp Desktop look. Left rail is one flat list of
 * conversations sorted by most-recent activity (avatar + name + last-message
 * preview + timestamp + unread badge). Right pane renders the shared
 * ChatPanel which already paints WhatsApp-style bubbles.
 *
 * Channel creation lives in the green header's "+" menu (admins can create
 * global channels; everyone can start DMs and groups).
 */

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  Hash,
  Plus,
  FolderKanban,
  Search,
  MessageSquare,
  Users,
  MessageCircle,
} from "lucide-react";
import { ChatPanel } from "@/components/chat/chat-panel";
import { useChannels, type ChannelSummary } from "@/lib/api/hooks";
import { useAuthStore } from "@/lib/store/auth-store";
import { toArray, cn } from "@/lib/utils";
import { LoadingState, ErrorState } from "@/components/ui/state";
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
} from "./_create-dialogs";

function initialsOf(firstName?: string | null, lastName?: string | null) {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase() || "?";
}

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

function previewOf(c: ChannelSummary, selfId?: string): string {
  if (!c.lastMessage) return "No messages yet";
  if (c.lastMessage.deleted) return "[message deleted]";
  const prefix = c.lastMessage.authorId === selfId ? "You: " : "";
  return prefix + c.lastMessage.content;
}

export default function ChatPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeId = searchParams.get("c");

  const channelsQuery = useChannels();
  const roles = useAuthStore((s) => s.user?.roles ?? []);
  const userId = useAuthStore((s) => s.user?.id);
  const canCreateGlobal = roles.some((r) => r === "SUPER_ADMIN" || r === "ADMIN");

  const [filter, setFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [dmOpen, setDmOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);

  const channels = toArray<ChannelSummary>(channelsQuery.data);

  // Flat WhatsApp-style list — recency-sorted, search matches name + DM
  // counterpart + project name.
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

  useEffect(() => {
    if (activeId) return;
    if (channels.length === 0) return;
    const first = filtered[0];
    if (first) router.replace(`${pathname}?c=${first.id}`);
  }, [activeId, channels, filtered, pathname, router]);

  const selectChannel = (id: string) => router.push(`${pathname}?c=${id}`);

  if (channelsQuery.isLoading) return <LoadingState label="Loading channels…" />;
  if (channelsQuery.isError) {
    const msg = (channelsQuery.error as any)?.message ?? "Unable to load chat.";
    return <ErrorState label={msg} />;
  }

  return (
    <div className="flex h-[calc(100vh-140px)] min-h-[560px] overflow-hidden rounded-xl border border-border/60 bg-white dark:bg-[#0b141a]">
      {/* Left rail — WhatsApp Desktop conversations list */}
      <aside className="flex w-[340px] shrink-0 flex-col border-r border-border/60 dark:border-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 bg-[#008069] px-4 py-3 text-white dark:bg-[#202c33]">
          <span className="text-base font-semibold">Chats</span>
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
                <MessageSquare className="size-3.5" /> New direct message
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setGroupOpen(true)}>
                <Users className="size-3.5" /> New group
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Search */}
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

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto bg-white dark:bg-[#0b141a]">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-slate-400">
              {filter ? "No results." : "No chats yet. Tap + to start one."}
            </p>
          ) : (
            filtered.map((c) => (
              <ConversationRow
                key={c.id}
                channel={c}
                selfId={userId}
                active={c.id === activeId}
                onSelect={() => selectChannel(c.id)}
              />
            ))
          )}
        </div>
      </aside>

      {/* Right pane — chat or empty state */}
      <section className="min-w-0 flex-1">
        {activeId ? (
          <ChatPanel channelId={activeId} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#f7f4ec] text-center dark:bg-[#0b141a]">
            <div className="flex size-20 items-center justify-center rounded-full bg-white text-[#008069] shadow-sm dark:bg-[#202c33] dark:text-[#00a884]">
              <MessageCircle className="size-9" />
            </div>
            <div>
              <div className="text-base font-semibold text-slate-700 dark:text-slate-100">
                Tectomi ERP Chat
              </div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Pick a chat from the left to start messaging.
              </div>
            </div>
          </div>
        )}
      </section>

      <CreateChannelDialog open={createOpen} onOpenChange={setCreateOpen} />
      <CreateDirectMessageDialog
        open={dmOpen}
        onOpenChange={setDmOpen}
        onCreated={(id) => router.push(`${pathname}?c=${id}`)}
      />
      <CreateGroupChannelDialog
        open={groupOpen}
        onOpenChange={setGroupOpen}
        onCreated={(id) => router.push(`${pathname}?c=${id}`)}
      />
    </div>
  );
}

function ConversationRow({
  channel,
  selfId,
  active,
  onSelect,
}: {
  channel: ChannelSummary;
  selfId?: string;
  active: boolean;
  onSelect: () => void;
}) {
  const unread = (channel.unreadCount ?? 0) > 0;
  const preview = previewOf(channel, selfId);
  const time = rowTime(channel.lastMessage?.createdAt ?? channel.updatedAt);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 border-b border-border/30 px-3 py-2.5 text-left transition dark:border-slate-800/60",
        active
          ? "bg-[#f0f2f5] dark:bg-[#2a3942]"
          : "hover:bg-slate-50 dark:hover:bg-[#202c33]",
      )}
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
