"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AtSign,
  Bell,
  Check,
  CheckCheck,
  Clock,
  Eye,
  FolderPlus,
  Megaphone,
  MessageCircle,
  MessageSquare,
  PartyPopper,
  Rocket,
  UserCheck,
  X,
} from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { ListPageLayout } from "@/components/layouts/list-page-layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/state";
import {
  useNotifications,
  useNotificationsUnread,
  useNotificationsUnreadCount,
  type NotificationRow,
  type NotificationType,
} from "@/lib/api/hooks";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
} from "@/lib/api/mutations";
import { cn, toArray } from "@/lib/utils";

type IconTone = {
  Icon: typeof Bell;
  // Tailwind classes for background + foreground of the icon badge.
  wrap: string;
  icon: string;
};

const TYPE_ICONS: Record<NotificationType, IconTone> = {
  TASK_ASSIGNED: {
    Icon: UserCheck,
    wrap: "bg-amber-100 dark:bg-amber-500/15",
    icon: "text-amber-600 dark:text-amber-400",
  },
  TASK_MENTIONED: {
    Icon: AtSign,
    wrap: "bg-violet-100 dark:bg-violet-500/15",
    icon: "text-violet-600 dark:text-violet-400",
  },
  TASK_WATCHER_ACTIVITY: {
    Icon: Eye,
    wrap: "bg-slate-100 dark:bg-slate-500/15",
    icon: "text-slate-600 dark:text-slate-300",
  },
  TASK_DUE_SOON: {
    Icon: Clock,
    wrap: "bg-red-100 dark:bg-red-500/15",
    icon: "text-red-600 dark:text-red-400",
  },
  TASK_COMMENT: {
    Icon: MessageSquare,
    wrap: "bg-blue-100 dark:bg-blue-500/15",
    icon: "text-blue-600 dark:text-blue-400",
  },
  SPRINT_STARTED: {
    Icon: Rocket,
    wrap: "bg-indigo-100 dark:bg-indigo-500/15",
    icon: "text-indigo-600 dark:text-indigo-400",
  },
  PROJECT_ADDED: {
    Icon: FolderPlus,
    wrap: "bg-emerald-100 dark:bg-emerald-500/15",
    icon: "text-emerald-600 dark:text-emerald-400",
  },
  PROJECT_MEMBER_ADDED: {
    Icon: FolderPlus,
    wrap: "bg-emerald-100 dark:bg-emerald-500/15",
    icon: "text-emerald-600 dark:text-emerald-400",
  },
  PROJECT_DEADLINE_SOON: {
    Icon: Clock,
    wrap: "bg-rose-100 dark:bg-rose-500/15",
    icon: "text-rose-600 dark:text-rose-400",
  },
  CHAT_MENTIONED: {
    Icon: MessageCircle,
    wrap: "bg-violet-100 dark:bg-violet-500/15",
    icon: "text-violet-600 dark:text-violet-400",
  },
  LEAVE_APPROVED: {
    Icon: Check,
    wrap: "bg-emerald-100 dark:bg-emerald-500/15",
    icon: "text-emerald-600 dark:text-emerald-400",
  },
  LEAVE_REJECTED: {
    Icon: X,
    wrap: "bg-rose-100 dark:bg-rose-500/15",
    icon: "text-rose-600 dark:text-rose-400",
  },
  HOLIDAY_UPCOMING: {
    Icon: PartyPopper,
    wrap: "bg-amber-100 dark:bg-amber-500/15",
    icon: "text-amber-600 dark:text-amber-400",
  },
  ANNOUNCEMENT_POSTED: {
    Icon: Megaphone,
    wrap: "bg-blue-100 dark:bg-blue-500/15",
    icon: "text-blue-600 dark:text-blue-400",
  },
  GENERIC: {
    Icon: Bell,
    wrap: "bg-slate-100 dark:bg-slate-500/15",
    icon: "text-slate-600 dark:text-slate-300",
  },
};

export default function NotificationsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"all" | "unread">("all");

  const allQuery = useNotifications();
  const unreadQuery = useNotificationsUnread();
  const unreadCountQuery = useNotificationsUnreadCount();

  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const all = useMemo(() => toArray<NotificationRow>(allQuery.data), [allQuery.data]);
  const unread = useMemo(() => toArray<NotificationRow>(unreadQuery.data), [unreadQuery.data]);
  const unreadCount = unreadCountQuery.data?.count ?? unread.length;
  const total = all.length;

  const rows = tab === "unread" ? unread : all;

  const handleRowClick = (n: NotificationRow) => {
    if (!n.readAt) {
      markRead.mutate(n.id);
    }
    if (n.link) {
      router.push(n.link);
    }
  };

  const isLoading = allQuery.isLoading || unreadQuery.isLoading;
  const isError = allQuery.isError || unreadQuery.isError;

  return (
    <ListPageLayout
      module="dashboard"
      title="Notifications"
      description="Your assignments, mentions, and task activity in one place."
      counts={[
        { label: "unread", value: unreadCount, tone: "positive" },
        { label: "total", value: total },
      ]}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-full border border-border bg-white/80 p-1 dark:bg-slate-950/60">
            <button
              type="button"
              onClick={() => setTab("all")}
              className={cn(
                "rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] transition",
                tab === "all"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400",
              )}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setTab("unread")}
              className={cn(
                "rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] transition",
                tab === "unread"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400",
              )}
            >
              Unread{unreadCount > 0 ? ` (${unreadCount})` : ""}
            </button>
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={unreadCount === 0 || markAllRead.isPending}
            onClick={() => markAllRead.mutate()}
          >
            <CheckCheck className="mr-1.5 size-4" />
            Mark all as read
          </Button>
        </div>

        {isLoading ? (
          <LoadingState label="Loading notifications..." />
        ) : isError ? (
          <ErrorState label="Unable to load notifications." />
        ) : rows.length === 0 ? (
          <Card>
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <div className="rounded-full bg-slate-100 p-4 dark:bg-slate-800/60">
                <Bell className="size-7 text-slate-400" />
              </div>
              <div>
                <p className="text-base font-semibold text-slate-900 dark:text-white">
                  You&apos;re all caught up
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  New assignments, @mentions, and task activity will show up here.
                </p>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="divide-y divide-border/70 p-0">
            {rows.map((n) => {
              const tone = TYPE_ICONS[n.type] ?? TYPE_ICONS.GENERIC;
              const { Icon } = tone;
              const isUnread = !n.readAt;
              const createdLabel = (() => {
                try {
                  return formatDistanceToNowStrict(new Date(n.createdAt), { addSuffix: true });
                } catch {
                  return "";
                }
              })();
              const fullTimestamp = (() => {
                try {
                  return new Date(n.createdAt).toLocaleString();
                } catch {
                  return n.createdAt;
                }
              })();

              return (
                <div
                  key={n.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleRowClick(n)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleRowClick(n);
                    }
                  }}
                  className={cn(
                    "group flex cursor-pointer items-start gap-4 px-5 py-4 transition hover:bg-slate-50 dark:hover:bg-slate-900/40",
                    isUnread && "bg-primary/5 dark:bg-primary/10",
                  )}
                >
                  <div
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-full",
                      tone.wrap,
                    )}
                  >
                    <Icon className={cn("size-5", tone.icon)} />
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span
                        title={fullTimestamp}
                        className={cn(
                          "truncate text-sm",
                          isUnread
                            ? "font-semibold text-slate-900 dark:text-white"
                            : "font-medium text-slate-700 dark:text-slate-200",
                        )}
                      >
                        {n.title}
                      </span>
                    </div>
                    {n.body && (
                      <p className="line-clamp-2 text-sm text-slate-500 dark:text-slate-400">
                        {n.body}
                      </p>
                    )}
                    <span className="mt-1 text-xs text-slate-400" title={fullTimestamp}>
                      {createdLabel}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 pt-1">
                    {isUnread && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            markRead.mutate(n.id);
                          }}
                          className="hidden items-center gap-1 rounded-full border border-transparent px-2 py-1 text-[11px] font-medium text-slate-500 opacity-0 transition hover:border-border hover:text-slate-700 group-hover:flex group-hover:opacity-100 dark:hover:text-slate-200"
                        >
                          <Check className="size-3" />
                          Mark read
                        </button>
                        <span className="size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </div>
    </ListPageLayout>
  );
}
