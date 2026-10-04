"use client";

import { useEffect, useState } from "react";
import { Bell, ChevronDown, LogOut, Menu, Moon, Search, Settings, SunMedium, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { SearchDialog } from "./search-dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { logoutRequest } from "@/lib/api/client";
import { useNotifications, useNotificationsUnreadCount } from "@/lib/api/hooks";
import { useMarkNotificationRead } from "@/lib/api/mutations";
import { toArray } from "@/lib/utils";
import Link from "next/link";
import { useAuthStore } from "@/lib/store/auth-store";
import { useUiStore } from "@/lib/store/ui-store";
import { AttendancePill } from "./attendance-pill";

export function Topbar() {
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const { sidebarOpen, setSidebarOpen, theme, toggleTheme } = useUiStore();
  const notifQuery = useNotifications();
  const markRead = useMarkNotificationRead();
  const notifications = toArray<{
    id: string;
    title: string;
    body?: string | null;
    readAt: string | null;
    createdAt: string;
    actionUrl?: string | null;
    link?: string | null;
  }>(notifQuery.data);

  const openNotification = (n: { id: string; readAt: string | null; actionUrl?: string | null; link?: string | null }) => {
    if (!n.readAt) markRead.mutate(n.id);
    const dest = n.actionUrl ?? n.link ?? "/notifications";
    router.push(dest);
  };
  const unreadCountQuery = useNotificationsUnreadCount();
  const unreadCount = unreadCountQuery.data?.count ?? 0;
  const user = useAuthStore((state) => state.user);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const clearSession = useAuthStore((state) => state.clearSession);

  // Global hotkeys: "/" and Cmd/Ctrl+K toggle the search palette. Ignore the
  // keystroke when the user is already typing into a form field so it doesn't
  // hijack normal text input.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isEditable =
        target?.isContentEditable ||
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT";

      const isSlash = e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey;
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";

      if ((isSlash && !isEditable) || isCmdK) {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function handleLogout() {
    if (refreshToken) {
      try {
        await logoutRequest(refreshToken);
      } catch {
        // Ignore logout transport failures and clear local session.
      }
    }

    clearSession();
    router.replace("/login");
  }

  const role = user?.roles[0]?.replaceAll("_", " ") ?? "Member";
  const displayName = user?.firstName
    ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`
    : (user?.email?.split("@")[0] ?? "Member");
  const userInitials = user?.firstName
    ? `${user.firstName[0]}${user.lastName ? user.lastName[0] : ""}`.toUpperCase()
    : (user?.email?.slice(0, 2) ?? "TC").toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border/70 bg-white/75 px-3 py-2.5 backdrop-blur-xl dark:bg-slate-950/75 md:gap-3 md:px-5 md:py-3">
      <div className="flex items-center gap-2 md:gap-3">
        {/* Sidebar toggle — same control across breakpoints, just sized differently. */}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label="Toggle sidebar"
        >
          <Menu className="size-4" />
        </Button>

        {/* Search — pill on lg+, icon on smaller screens. */}
        <button
          onClick={() => setSearchOpen(true)}
          className="hidden items-center gap-2 rounded-full border border-border bg-white/70 px-3.5 py-2 text-sm text-slate-400 transition hover:border-slate-300 hover:bg-white hover:text-slate-600 dark:bg-slate-950/50 dark:hover:bg-slate-900 dark:hover:text-slate-200 lg:flex"
        >
          <Search className="size-4" />
          <span>Search projects, tasks, clients…</span>
          <kbd className="ml-6 rounded border border-border/70 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-300">
            ⌘K
          </kbd>
        </button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setSearchOpen(true)}
          className="lg:hidden"
          aria-label="Search"
        >
          <Search className="size-4" />
        </Button>
      </div>

      <div className="flex items-center gap-1 md:gap-2">
        {/* Attendance status / clock-in widget. */}
        <AttendancePill />

        {/* Theme toggle */}
        <Button
          variant="secondary"
          size="sm"
          onClick={toggleTheme}
          aria-label="Toggle theme"
          title={theme === "light" ? "Switch to dark" : "Switch to light"}
        >
          {theme === "light" ? <Moon className="size-4" /> : <SunMedium className="size-4" />}
        </Button>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="secondary"
              size="sm"
              className="relative hidden sm:inline-flex"
              aria-label="Notifications"
            >
              <Bell className="size-4" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white ring-2 ring-white dark:ring-slate-950">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              Notifications
              {unreadCount > 0 && (
                <Badge tone="destructive" size="sm">
                  {unreadCount} new
                </Badge>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {notifications.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-slate-400">No notifications</div>
            ) : (
              notifications.slice(0, 8).map((n) => (
                <DropdownMenuItem
                  key={n.id}
                  className="flex-col items-start gap-0.5 py-2.5"
                  onClick={() => openNotification(n)}
                >
                  <span
                    className={`text-sm ${
                      n.readAt
                        ? "font-normal text-slate-600 dark:text-slate-300"
                        : "font-semibold text-slate-900 dark:text-white"
                    }`}
                  >
                    {!n.readAt && <span className="mr-1.5 inline-block size-1.5 rounded-full bg-primary align-middle" />}
                    {n.title}
                  </span>
                  {n.body && <span className="text-xs text-slate-500">{n.body}</span>}
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link
                href="/notifications"
                className="w-full justify-center text-center text-xs font-medium text-primary"
              >
                View all
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Account menu — replaces standalone role badge + logout button + avatar block.
            Trigger collapses to just the avatar on small screens; expands to show
            name + role chevron on md+. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="group flex items-center gap-2 rounded-full border border-border bg-white/70 p-1 pr-2 transition hover:border-slate-300 hover:bg-white dark:bg-slate-950/50 dark:hover:bg-slate-900 md:gap-2.5 md:pr-3"
              aria-label="Account menu"
            >
              <Avatar initials={userInitials} className="size-7 md:size-8" />
              <div className="hidden text-left md:block">
                <div className="max-w-[140px] truncate text-[13px] font-medium leading-tight text-slate-900 dark:text-white">
                  {displayName}
                </div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{role}</div>
              </div>
              <ChevronDown className="hidden size-3.5 text-slate-400 transition group-data-[state=open]:rotate-180 md:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <div className="px-3 py-2.5">
              <div className="truncate text-sm font-medium text-slate-900 dark:text-white">
                {user?.email ?? "Unknown"}
              </div>
              <div className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-500">{role}</div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/profile">
                <User className="size-4 text-slate-400" /> My profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Settings className="size-4 text-slate-400" /> Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={toggleTheme} className="sm:hidden">
              {theme === "light" ? <Moon className="size-4 text-slate-400" /> : <SunMedium className="size-4 text-slate-400" />}
              {theme === "light" ? "Dark mode" : "Light mode"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onClick={handleLogout}>
              <LogOut className="size-4" /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  );
}
