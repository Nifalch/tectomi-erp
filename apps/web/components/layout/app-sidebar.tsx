"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BriefcaseBusiness,
  Building2,
  Clock3,
  CreditCard,
  FolderKanban,
  Receipt,
  Settings,
  Users2,
  Wallet,
  CalendarCheck2,
  CalendarClock,
  Files,
  LayoutTemplate,
  ChevronDown,
  X,
  Award,
  Laptop,
  Megaphone,
  CalendarCheck,
  Crown,
  PieChart,
  Users,
  Handshake,
  MessageSquare,
  Bell,
  ListTodo,
  Target,
  CalendarDays,
  UserPlus,
  Calculator,
  Palmtree,
  TrendingUp,
  ShieldCheck,
  Landmark,
  Repeat,
  ScrollText,
  Coins,
  ArrowRightLeft,
  FileMinus2,
  Package,
  ListTree,
  Percent,
  BookOpen,
  Boxes,
  Truck,
  BarChart3,
  Lightbulb,
  KeyRound,
  Newspaper,
  CalendarRange,
  Rocket,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useChannels, useMyAccessSnapshot, useNotificationsUnreadCount } from "@/lib/api/hooks";
import {
  navigationItems,
  MODULE_META,
  NAV_GROUP_LABELS,
  NAV_GROUP_ORDER,
  type AppRole,
} from "@nuro7/contracts";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/store/auth-store";
import { useUiStore } from "@/lib/store/ui-store";

// Each nav item gets its own icon — no two rows should look alike. When a new
// nav title lands without a mapping it falls back to a neutral dot via the
// switch below in the render.
const iconMap: Record<string, LucideIcon> = {
  // Workspace
  Dashboard: LayoutDashboard,
  Notifications: Bell,
  // Project management
  Projects: FolderKanban,
  Tasks: BriefcaseBusiness,
  "My Tasks": ListTodo,
  Goals: Target,
  Calendar: CalendarDays,
  // CRM & sales
  Clients: Building2,
  Leads: UserPlus,
  Contacts: Users,
  Deals: Handshake,
  Proposals: LayoutTemplate,
  Estimates: Calculator,
  // HR & people
  HR: Users2,
  Founders: Crown,
  "Cap Table": PieChart,
  Attendance: CalendarCheck2,
  Leave: CalendarClock,
  Holidays: Palmtree,
  Announcements: Megaphone,
  Assets: Laptop,
  Performance: Award,
  "My Performance": TrendingUp,
  Payroll: Wallet,
  // Time
  Time: Clock3,
  Timesheets: CalendarCheck,
  Approvals: ShieldCheck,
  // Finance
  Finance: CreditCard,
  "Main Account": Landmark,
  Invoices: Receipt,
  "Recurring Invoices": Repeat,
  Bills: ScrollText,
  Expenses: Coins,
  Payments: ArrowRightLeft,
  "Credit Notes": FileMinus2,
  Items: Package,
  "Bank Accounts": Landmark,
  "Chart of Accounts": ListTree,
  "Tax Rates": Percent,
  "Journal Entries": BookOpen,
  // Studio
  Marketing: Newspaper,
  "Social Planner": CalendarRange,
  Ideas: Rocket,
  Tools: Wrench,
  // Vault
  Credentials: KeyRound,
  // Docs
  Documents: Files,
  "Knowledge Base": Lightbulb,
  Templates: LayoutTemplate,
  // Ops
  Resources: Boxes,
  Vendors: Truck,
  Reports: BarChart3,
  // Settings & comms
  Settings,
  Chat: MessageSquare,
};

export function AppSidebar() {
  const role = useAuthStore((state) => state.user?.roles[0] ?? "EMPLOYEE") as AppRole;
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen);
  const pathname = usePathname();

  const isAuthed = useAuthStore((state) => !!state.user);
  const channelsQuery = useChannels(isAuthed);
  const totalUnread = Array.isArray(channelsQuery.data)
    ? channelsQuery.data.reduce((s, c) => s + (c.unreadCount ?? 0), 0)
    : 0;
  const notifUnreadQuery = useNotificationsUnreadCount(isAuthed);
  const notifUnread = notifUnreadQuery.data?.count ?? 0;

  // Per-user override layer — DENY hides a module the role normally sees,
  // GRANT shows one it normally wouldn't. While the API call is in flight we
  // fall back to the role-default filter so the user never sees an empty
  // sidebar on the first render.
  const accessSnapshot = useMyAccessSnapshot(isAuthed);
  const overrideMap = new Map<string, "GRANT" | "DENY">(
    (accessSnapshot.data?.overrides ?? []).map((o) => [o.moduleKey, o.override]),
  );
  const items = navigationItems.filter((item) => {
    if (item.hidden) return false;
    const ov = overrideMap.get(item.moduleKey);
    if (ov === "GRANT") return true;
    if (ov === "DENY") return false;
    return item.roles.includes(role);
  });

  const grouped = NAV_GROUP_ORDER.map((group) => ({
    group,
    label: NAV_GROUP_LABELS[group],
    items: items.filter((item) => item.group === group),
  })).filter((g) => g.items.length > 0);

  // Pick the single most-specific nav item that matches the current pathname.
  // Without longest-prefix-wins, sub-routes like /finance/main highlight BOTH
  // "Finance" and "Main Account".
  const activeHref = items.reduce<string | null>((best, item) => {
    const matches = pathname === item.href || pathname.startsWith(item.href + "/");
    if (!matches) return best;
    if (!best || item.href.length > best.length) return item.href;
    return best;
  }, null);

  const showLabels = sidebarOpen;

  // Per-group collapse state, persisted to localStorage so navigation
  // preferences survive a reload. Collapsed groups hide their nav rows
  // but the group header stays clickable so the user can re-open. Only
  // applies when the sidebar is in expanded (label-showing) mode — in
  // collapsed icon-only mode we always show everything because the
  // chevron would be hidden anyway.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("nuro:sidebar-collapsed-groups");
      if (raw) setCollapsedGroups(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* ignore — fresh state is fine */
    }
  }, []);
  const toggleGroup = (group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      try {
        window.localStorage.setItem(
          "nuro:sidebar-collapsed-groups",
          JSON.stringify(Array.from(next)),
        );
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <aside
      className="flex h-screen w-full flex-col border-r border-border/70 bg-white dark:bg-slate-950"
    >
      {/* Header — tightened so the nav can start higher on the page. */}
      <div
        className={cn(
          "flex items-center justify-between border-b border-border/40 pb-3 pt-4",
          showLabels ? "px-4" : "px-3 justify-center",
        )}
      >
        <Link href="/dashboard" className="flex items-center gap-2.5 py-0.5" aria-label="Tectomi ERP home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icon.png"
            alt="Tectomi ERP"
            className="size-8 shrink-0 object-contain select-none"
          />
          {showLabels && (
            <div className="flex items-center gap-2">
              <span className="text-[17px] font-extrabold tracking-tight text-slate-900 dark:text-white leading-none">
                TECTOMI
              </span>
              <span className="rounded-md border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-bold tracking-widest text-sky-600 dark:text-sky-400">
                ERP
              </span>
            </div>
          )}
        </Link>
        {showLabels && (
          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 md:hidden"
            aria-label="Close sidebar"
          >
            <X className="size-5" />
          </button>
        )}
      </div>

      {/* Custom scrollbar — visible only on hover, ultra-thin, matched to theme.
          Inline <style> keeps it scoped to this nav element only. */}
      <nav className="nuro-sidebar-scroll flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3">
        <style jsx>{`
          .nuro-sidebar-scroll {
            scrollbar-width: none;
          }
          .nuro-sidebar-scroll::-webkit-scrollbar {
            width: 0;
            background: transparent;
          }
          .nuro-sidebar-scroll:hover {
            scrollbar-width: thin;
            scrollbar-color: rgba(100, 116, 139, 0.25) transparent;
          }
          .nuro-sidebar-scroll:hover::-webkit-scrollbar {
            width: 4px;
          }
          .nuro-sidebar-scroll:hover::-webkit-scrollbar-thumb {
            background-color: rgba(100, 116, 139, 0.25);
            border-radius: 9999px;
          }
          .nuro-sidebar-scroll:hover::-webkit-scrollbar-thumb:hover {
            background-color: rgba(100, 116, 139, 0.4);
          }
        `}</style>
        {grouped.map((group, gIdx) => {
          const isCollapsed = collapsedGroups.has(group.group);
          // Auto-expand whichever group contains the active route — it'd
          // be jarring for the current page's nav item to be hidden.
          const groupHasActive = group.items.some((i) => i.href === activeHref);
          const effectivelyCollapsed = showLabels && isCollapsed && !groupHasActive;
          return (
          <div key={group.group} className={cn("flex flex-col gap-0.5", gIdx > 0 && "mt-1.5")}>
            {showLabels && (
              <button
                type="button"
                onClick={() => toggleGroup(group.group)}
                className="group/header mb-0.5 flex w-full items-center justify-between rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-200"
                aria-expanded={!effectivelyCollapsed}
              >
                <span>{group.label}</span>
                <ChevronDown
                  className={cn(
                    "size-3 text-slate-400 transition group-hover/header:text-slate-600 dark:group-hover/header:text-slate-200",
                    effectivelyCollapsed && "-rotate-90",
                  )}
                />
              </button>
            )}
            {!effectivelyCollapsed && group.items.map((item) => {
              const Icon = iconMap[item.title];
              const meta = MODULE_META[item.moduleKey];
              const isActive = item.href === activeHref;
              const unreadForRow =
                item.title === "Chat"
                  ? totalUnread
                  : item.href === "/notifications"
                    ? notifUnread
                    : 0;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={showLabels ? undefined : item.title}
                  onClick={() => {
                    if (window.innerWidth < 768) setSidebarOpen(false);
                  }}
                  className={cn(
                    // Tightened row: smaller py for a denser nav. With ~25
                    // possible rows the extra ~4px each adds up to a full
                    // viewport screen of saved scroll.
                    "group relative flex items-center rounded-lg text-[13px] transition",
                    showLabels ? "gap-2.5 px-2.5 py-1.5" : "justify-center px-2 py-2.5",
                    isActive
                      ? "bg-slate-900 text-white shadow-sm dark:bg-white/10"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800/50",
                  )}
                >
                  {/* Module-color left rail on the active row */}
                  {isActive && (
                    <span
                      className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full"
                      style={{ backgroundColor: meta?.hex }}
                    />
                  )}
                  <span
                    className={cn(
                      "relative flex size-5 shrink-0 items-center justify-center",
                      !isActive && "group-hover:text-slate-900 dark:group-hover:text-white",
                    )}
                  >
                    {Icon ? (
                      <Icon className="size-[18px]" strokeWidth={isActive ? 2.2 : 1.75} />
                    ) : (
                      // Fallback — colored dot keeps rows distinct even if a
                      // title slipped through without an icon mapping.
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: meta?.hex ?? "#94a3b8" }}
                      />
                    )}
                    {/* Unread badge on collapsed icon-only mode */}
                    {!showLabels && unreadForRow > 0 && (
                      <span className="absolute -right-1 -top-1 flex min-w-[14px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold leading-[14px] text-white ring-2 ring-white dark:ring-slate-950">
                        {unreadForRow > 99 ? "99+" : unreadForRow}
                      </span>
                    )}
                  </span>
                  {showLabels && (
                    <>
                      <span className="truncate font-medium">{item.title}</span>
                      {unreadForRow > 0 && (
                        <span className="ml-auto rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                          {unreadForRow > 99 ? "99+" : unreadForRow}
                        </span>
                      )}
                    </>
                  )}
                </Link>
              );
            })}
          </div>
          );
        })}
      </nav>

      {/* Footer brand strip — gives the sidebar a finished edge */}
      {showLabels && (
        <div className="border-t border-border/40 px-4 py-2 text-[10px] text-slate-400">
          <div className="flex items-center justify-between">
            <span className="font-semibold tracking-wider">TECTOMI ERP</span>
            <span className="text-slate-300 dark:text-slate-600">v1.0</span>
          </div>
        </div>
      )}
    </aside>
  );
}
