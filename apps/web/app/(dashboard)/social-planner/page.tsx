"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, ListFilter, Plus } from "lucide-react";
import { ListPageLayout } from "@/components/layouts/list-page-layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  useSocialPosts,
  type SocialPlatform,
  type SocialPostRow,
  type SocialPostStatus,
} from "@/lib/api/hooks";
import {
  SOCIAL_PLATFORM_META,
  SOCIAL_PLATFORM_OPTIONS,
  SOCIAL_STATUS_META,
  SOCIAL_STATUS_OPTIONS,
  formatDate,
  formatTime,
} from "@/components/studio/studio-utils";
import { SocialPostEditor } from "@/components/studio/social-post-editor";

type ViewMode = "calendar" | "list";

export default function SocialPlannerPage() {
  const [view, setView] = useState<ViewMode>("calendar");
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState<SocialPlatform | "">("");
  const [statusFilter, setStatusFilter] = useState<SocialPostStatus | "">("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<SocialPostRow | null>(null);
  const [defaultDate, setDefaultDate] = useState<Date | null>(null);

  // For the calendar view we fetch a window that covers the visible grid
  // (cursor month padded out to whole weeks). For the list view we drop the
  // bounds so the user sees everything.
  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart);
  const gridEnd = endOfWeek(monthEnd);

  const postsQuery = useSocialPosts({
    search,
    platform: platformFilter,
    status: statusFilter,
    ...(view === "calendar"
      ? { from: gridStart.toISOString(), to: gridEnd.toISOString() }
      : {}),
  });
  const posts = postsQuery.data ?? [];

  const postsByDay = useMemo(() => {
    const map = new Map<string, SocialPostRow[]>();
    for (const p of posts) {
      if (!p.scheduledAt) continue;
      const key = dayKey(new Date(p.scheduledAt));
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }
    return map;
  }, [posts]);

  const counts = [
    { label: "Scheduled", value: posts.filter((p) => p.status === "SCHEDULED").length, tone: "info" as const },
    { label: "Published", value: posts.filter((p) => p.status === "PUBLISHED").length, tone: "positive" as const },
    { label: "Drafts", value: posts.filter((p) => p.status === "DRAFT").length, tone: "neutral" as const },
  ];

  return (
    <ListPageLayout
      module="social"
      title="Social planner"
      description="Schedule, draft, and ship the company's social media presence — one calendar across every platform."
      counts={counts}
      primaryAction={{
        label: "New post",
        icon: <Plus className="size-4" />,
        onClick: () => {
          setEditing(null);
          setDefaultDate(null);
          setEditorOpen(true);
        },
      }}
    >
      {/* Toolbar */}
      <Card className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-1 rounded-full bg-slate-100 p-1 text-xs dark:bg-slate-800">
            {(["calendar", "list"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setView(m)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-3 py-1 font-medium transition",
                  view === m ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white" : "text-slate-500 hover:text-slate-700",
                )}
              >
                {m === "calendar" ? <CalendarDays className="size-3.5" /> : <ListFilter className="size-3.5" />}
                {m === "calendar" ? "Calendar" : "List"}
              </button>
            ))}
          </div>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search captions or notes…"
            className="flex-1"
          />
          <Select
            value={platformFilter}
            onValueChange={(v) => setPlatformFilter(v as SocialPlatform | "")}
            options={[{ value: "", label: "All platforms" }, ...SOCIAL_PLATFORM_OPTIONS]}
            size="sm"
            className="w-full sm:w-44"
          />
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as SocialPostStatus | "")}
            options={[{ value: "", label: "All statuses" }, ...SOCIAL_STATUS_OPTIONS]}
            size="sm"
            className="w-full sm:w-40"
          />
        </div>
      </Card>

      {view === "calendar" ? (
        <Card className="space-y-3">
          <header className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              {cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </h3>
            <div className="flex items-center gap-1">
              <Button variant="secondary" size="sm" onClick={() => setCursor(addMonths(cursor, -1))} aria-label="Previous month">
                <ChevronLeft className="size-4" />
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setCursor(startOfMonth(new Date()))}>
                Today
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setCursor(addMonths(cursor, 1))} aria-label="Next month">
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </header>

          {/* Calendar grid */}
          <div>
            <div className="mb-1 grid grid-cols-7 gap-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {eachDayInRange(gridStart, gridEnd).map((day) => {
                const inMonth = day.getMonth() === cursor.getMonth();
                const isToday = isSameDay(day, new Date());
                const dayPosts = postsByDay.get(dayKey(day)) ?? [];
                return (
                  <button
                    key={dayKey(day)}
                    onClick={() => {
                      setEditing(null);
                      setDefaultDate(combineDateWithCurrentTime(day));
                      setEditorOpen(true);
                    }}
                    className={cn(
                      "min-h-[110px] rounded-xl border border-border bg-white p-2 text-left transition hover:border-slate-300 dark:bg-slate-950",
                      !inMonth && "opacity-50",
                      isToday && "ring-2 ring-primary/40",
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span className={cn(
                        "inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold",
                        isToday ? "bg-primary text-white" : "text-slate-600 dark:text-slate-300",
                      )}>
                        {day.getDate()}
                      </span>
                      {dayPosts.length > 0 && (
                        <span className="text-[10px] font-semibold text-slate-400">{dayPosts.length}</span>
                      )}
                    </div>
                    <div className="space-y-1">
                      {dayPosts.slice(0, 3).map((p) => {
                        const meta = SOCIAL_PLATFORM_META[p.platform];
                        const Icon = meta.icon;
                        return (
                          <div
                            key={p.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditing(p);
                              setDefaultDate(null);
                              setEditorOpen(true);
                            }}
                            className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] hover:bg-slate-100 dark:hover:bg-slate-900"
                            style={{ borderLeft: `2px solid ${meta.hex}` }}
                          >
                            <Icon className="size-3 shrink-0" style={{ color: meta.hex }} />
                            <span className="truncate text-slate-700 dark:text-slate-200">
                              {p.title || p.content.slice(0, 24)}
                            </span>
                            <span className="ml-auto text-[10px] text-slate-400">{formatTime(p.scheduledAt)}</span>
                          </div>
                        );
                      })}
                      {dayPosts.length > 3 && (
                        <span className="text-[10px] text-slate-400">+{dayPosts.length - 3} more</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </Card>
      ) : (
        <Card className="space-y-3 p-0 sm:p-0">
          {posts.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <CalendarDays className="mx-auto mb-3 size-10 text-slate-300" />
              <p className="text-sm text-slate-500">No posts match these filters.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {posts.map((p) => {
                const meta = SOCIAL_PLATFORM_META[p.platform];
                const status = SOCIAL_STATUS_META[p.status];
                const Icon = meta.icon;
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => { setEditing(p); setDefaultDate(null); setEditorOpen(true); }}
                      className="group flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900/60"
                    >
                      <div
                        className="flex size-10 shrink-0 items-center justify-center rounded-xl"
                        style={{ backgroundColor: meta.hex + "1a", color: meta.hex }}
                      >
                        <Icon className="size-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                            {p.title || p.content.slice(0, 60)}
                          </span>
                          <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", status.chip)}>
                            {status.label}
                          </span>
                          {p.marketingIdea && (
                            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              {p.marketingIdea.title}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 line-clamp-1 text-xs text-slate-500">{p.content}</div>
                      </div>
                      <div className="hidden text-right text-xs text-slate-500 sm:block">
                        {p.scheduledAt ? (
                          <>
                            <div>{formatDate(p.scheduledAt)}</div>
                            <div className="text-[11px] text-slate-400">{formatTime(p.scheduledAt)}</div>
                          </>
                        ) : (
                          <span>Unscheduled</span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      <SocialPostEditor
        open={editorOpen}
        onOpenChange={(o) => {
          setEditorOpen(o);
          if (!o) {
            setEditing(null);
            setDefaultDate(null);
          }
        }}
        post={editing}
        defaultDate={defaultDate}
      />
    </ListPageLayout>
  );
}

// ─── Date helpers (kept inline — tiny scope, no library needed) ───────────────

function startOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59); }
function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setDate(d.getDate() - d.getDay());
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfWeek(d: Date): Date {
  const x = startOfWeek(d);
  x.setDate(x.getDate() + 6);
  x.setHours(23, 59, 59, 999);
  return x;
}
function addMonths(d: Date, n: number): Date { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function eachDayInRange(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
// When the user clicks a day cell to create a new post, default the time
// portion to "now-ish" instead of midnight — looks less surprising.
function combineDateWithCurrentTime(d: Date): Date {
  const now = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), now.getHours(), now.getMinutes(), 0, 0);
}
