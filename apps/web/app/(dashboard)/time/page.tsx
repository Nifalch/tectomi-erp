"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus, CheckCircle2 } from "lucide-react";
import { ViewAsSelector } from "@/components/admin/view-as-selector";
import { ListPageLayout } from "@/components/layouts/list-page-layout";
import { CreateTimeEntryDialog } from "@/components/time/create-time-entry-dialog";
import { DataTable } from "@/components/ui/data-table";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form";
import { DatePicker } from "@/components/ui/date-picker";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useTimeEntries, useMyTimesheets } from "@/lib/api/hooks";
import { useCreateTimesheet, useSubmitTimesheet } from "@/lib/api/mutations";
import { toArray, cn } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";

interface TimeRow {
  id: string;
  project: { name: string };
  task?: { title: string } | null;
  duration: number;
  startTime: string;
  notes?: string;
  // Backend always includes `user` in the entry payload; "Everyone" mode
  // surfaces it as a column, single-user view ignores it.
  user?: { firstName?: string; lastName?: string; email?: string };
}

interface Timesheet {
  id: string;
  weekStart: string;
  totalHours?: number;
  status: string;
}

function buildColumns(showUser: boolean): ColumnDef<TimeRow, unknown>[] {
  const cols: ColumnDef<TimeRow, unknown>[] = [];
  if (showUser) {
    cols.push({
      id: "user",
      header: "User",
      cell: ({ row }) => {
        const u = row.original.user;
        if (!u) return "—";
        const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
        return name || u.email || "—";
      },
    });
  }
  cols.push(
    { accessorKey: "project", header: "Project", cell: ({ row }) => row.original.project.name },
    { id: "task", header: "Task", cell: ({ row }) => row.original.task?.title ?? "Manual entry" },
    { accessorKey: "duration", header: "Duration", cell: ({ row }) => {
      const mins = row.original.duration;
      const hrs = Math.floor(mins / 60);
      const rem = mins % 60;
      return hrs > 0 ? `${hrs}h ${rem}m` : `${rem}m`;
    }},
    { accessorKey: "startTime", header: "Date", cell: ({ row }) => new Date(row.original.startTime).toLocaleString() },
    { id: "notes", header: "Notes", cell: ({ row }) => <span className="truncate text-xs text-slate-500">{row.original.notes ?? "—"}</span> },
  );
  return cols;
}

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

const SECTIONS = [
  { key: "log", label: "Log" },
  { key: "week", label: "My Week" },
] as const;
type SectionKey = (typeof SECTIONS)[number]["key"];

export default function TimePage() {
  const searchParams = useSearchParams();
  const viewUserId = searchParams.get("userId") ?? undefined;
  const [active, setActive] = useState<SectionKey>("log");

  return (
    <ListPageLayout
      module="time"
      title="Time"
      description="Log entries and submit your weekly timesheet."
    >
      <div className="-mt-2 mb-4 flex items-center justify-between gap-3">
        <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              onClick={() => setActive(s.key)}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-medium transition",
                active === s.key
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <ViewAsSelector />
      </div>

      {active === "log" && <LogSection viewUserId={viewUserId} />}
      {active === "week" && <MyWeekSection />}
    </ListPageLayout>
  );
}

// Date-range presets. Each computes a [from, to) window relative to today.
type RangeKey = "today" | "week" | "lastWeek" | "month" | "all";
const RANGE_OPTIONS: Array<{ key: RangeKey; label: string }> = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "lastWeek", label: "Last Week" },
  { key: "month", label: "This Month" },
  { key: "all", label: "All Time" },
];

function rangeFor(key: RangeKey): { from?: string; to?: string } {
  const now = new Date();
  if (key === "all") return {};
  if (key === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { from: start.toISOString(), to: end.toISOString() };
  }
  if (key === "week") {
    const start = startOfWeek(now);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { from: start.toISOString(), to: end.toISOString() };
  }
  if (key === "lastWeek") {
    const thisWeekStart = startOfWeek(now);
    const start = new Date(thisWeekStart);
    start.setDate(start.getDate() - 7);
    return { from: start.toISOString(), to: thisWeekStart.toISOString() };
  }
  // month
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

function KpiTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-white">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-slate-500">{sub}</p>}
    </Card>
  );
}

function formatMinutes(mins: number) {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function LogSection({ viewUserId }: { viewUserId?: string }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [range, setRange] = useState<RangeKey>("week");
  // Bump page size so KPIs reflect the whole range — default 10 would chop
  // off most entries and skew the totals. 500 covers a team of ~15 logging
  // ~5 entries/day over 7 days with headroom.
  const query = useTimeEntries(viewUserId, { ...rangeFor(range), pageSize: 500 });

  if (query.isLoading) return <LoadingState label="Loading time entries..." />;
  if (query.isError || !query.data) return <ErrorState label="Unable to load time entries." />;

  const entries = toArray<TimeRow>(query.data);
  const showUserColumn = !viewUserId;
  const cols = buildColumns(showUserColumn);

  // KPI computation — single pass over entries in the selected window.
  const totalMin = entries.reduce((s, e) => s + (e.duration ?? 0), 0);
  const uniqueUsers = new Set(entries.map((e) => e.user?.firstName ?? "")).size;
  const billableMin = entries
    .filter((e) => (e as unknown as { billable?: boolean }).billable)
    .reduce((s, e) => s + (e.duration ?? 0), 0);
  // Average hours per active person per workday in the range. "Workday"
  // count = unique YYYY-MM-DD dates that appear in the entries (so a week
  // with logs on only 3 days divides by 3, not 7).
  const days = new Set(entries.map((e) => new Date(e.startTime).toISOString().slice(0, 10))).size;
  const avgMin = uniqueUsers > 0 && days > 0 ? totalMin / uniqueUsers / days : 0;
  const billablePct = totalMin > 0 ? Math.round((billableMin / totalMin) * 100) : 0;

  const rangeLabel = RANGE_OPTIONS.find((r) => r.key === range)?.label ?? "";

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-white p-1 dark:bg-slate-900/60">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setRange(opt.key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition",
                range === opt.key
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 size-4" /> Log Time
        </Button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile
          label="Total logged"
          value={formatMinutes(totalMin)}
          sub={`${entries.length} ${entries.length === 1 ? "entry" : "entries"} · ${rangeLabel}`}
        />
        <KpiTile
          label="Active people"
          value={String(uniqueUsers)}
          sub={uniqueUsers === 0 ? "Nobody logged yet" : "with at least one entry"}
        />
        <KpiTile
          label="Billable"
          value={formatMinutes(billableMin)}
          sub={totalMin > 0 ? `${billablePct}% of total` : "—"}
        />
        <KpiTile
          label="Avg per person / day"
          value={formatMinutes(avgMin)}
          sub={days > 0 ? `Across ${days} active ${days === 1 ? "day" : "days"}` : "No activity"}
        />
      </div>

      <DataTable
        columns={cols}
        data={entries}
        searchPlaceholder="Search entries..."
        moduleColor="time"
        emptyState={{ title: "No time entries", description: "Time entries will appear here when logged." }}
      />
      <CreateTimeEntryDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}

function MyWeekSection() {
  const [createOpen, setCreateOpen] = useState(false);
  const [weekStart, setWeekStart] = useState<Date | undefined>(startOfWeek(new Date()));
  const myQuery = useMyTimesheets();
  const createMutation = useCreateTimesheet();

  if (myQuery.isLoading) return <LoadingState label="Loading timesheets..." />;
  if (myQuery.isError) return <ErrorState label="Unable to load timesheets." />;

  const my = toArray<Timesheet>(myQuery.data);

  const columns: ColumnDef<Timesheet, unknown>[] = [
    {
      accessorKey: "weekStart", header: "Week of",
      cell: ({ row }) => new Date(row.original.weekStart).toLocaleDateString(),
    },
    {
      accessorKey: "totalHours", header: "Total Hours",
      cell: ({ row }) => row.original.totalHours != null ? `${Number(row.original.totalHours).toFixed(1)}h` : "—",
    },
    {
      accessorKey: "status", header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} dot size="sm" />,
    },
    {
      id: "actions", header: "",
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Link href={`/timesheets/${row.original.id}`} className="text-xs font-medium text-primary">View</Link>
          {row.original.status === "DRAFT" && <SubmitBtn id={row.original.id} />}
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Weekly rollup of all your logged entries — submit for approval.
        </p>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 size-4" /> New Week
        </Button>
      </div>

      {my.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <CheckCircle2 className="size-10 text-slate-300" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">No timesheets yet</p>
            <p className="text-xs text-slate-500">Click "New Week" to roll up your entries for a given week.</p>
          </div>
        </Card>
      ) : (
        <DataTable columns={columns} data={my} moduleColor="time" emptyState={{ title: "No timesheets yet" }} />
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Create Timesheet</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <FormField label="Week Start">
              <DatePicker value={weekStart} onChange={setWeekStart} />
            </FormField>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button
                disabled={!weekStart || createMutation.isPending}
                onClick={() => {
                  if (!weekStart) return;
                  createMutation.mutate({ weekStart: weekStart.toISOString() }, {
                    onSuccess: () => setCreateOpen(false),
                  });
                }}
              >
                {createMutation.isPending ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SubmitBtn({ id }: { id: string }) {
  const submit = useSubmitTimesheet(id);
  return (
    <button onClick={() => submit.mutate()} className="text-xs font-medium text-primary" disabled={submit.isPending}>
      {submit.isPending ? "..." : "Submit"}
    </button>
  );
}
