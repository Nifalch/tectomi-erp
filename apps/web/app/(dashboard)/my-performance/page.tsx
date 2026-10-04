"use client";

import { useMemo, useState } from "react";
import { ModuleHeader } from "@/components/layout/module-header";
import { Card } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Select } from "@/components/ui/select";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { ChartCard, HorizontalBarChart, TrendChart } from "@/components/charts";
import { useMyPerformance, useUserPerformance, useUsers } from "@/lib/api/hooks";
import { useAuthStore } from "@/lib/store/auth-store";
import { formatHours, toArray } from "@/lib/utils";

const ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN", "HR_MANAGER", "PROJECT_MANAGER"] as const;

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function KpiCard({ label, value, sublabel }: { label: string; value: string; sublabel?: string }) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{value}</p>
      {sublabel && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sublabel}</p>}
    </Card>
  );
}

interface UserRow {
  id: string;
  firstName: string;
  lastName: string;
}

interface PerformanceResponse {
  totalMinutes: number;
  billableMinutes: number;
  entryCount: number;
  tasksTotal: number;
  tasksCompleted: number;
  storyPointsTotal: number;
  storyPointsCompleted: number;
  byProject: Array<{ project: { id: string; name: string }; minutes: number; count: number }>;
  byDay: Array<{ date: string; minutes: number }>;
}

export default function MyPerformancePage() {
  const roles = useAuthStore((s) => s.user?.roles ?? []);
  const selfId = useAuthStore((s) => s.user?.id) ?? null;
  const isAdmin = roles.some((r) => (ADMIN_ROLES as readonly string[]).includes(r));

  const defaults = useMemo(() => {
    const now = new Date();
    const start = new Date();
    start.setDate(now.getDate() - 30);
    return { from: start, to: now };
  }, []);

  const [fromDate, setFromDate] = useState<Date | undefined>(defaults.from);
  const [toDate, setToDate] = useState<Date | undefined>(defaults.to);
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  const fromStr = fromDate ? toIsoDate(fromDate) : undefined;
  const toStr = toDate ? toIsoDate(toDate) : undefined;

  const usersQuery = useUsers();
  const users = toArray<UserRow>(usersQuery.data);

  // If admin and another user selected, use user performance; otherwise me.
  const viewingOther = isAdmin && !!selectedUserId && selectedUserId !== selfId;

  const myQuery = useMyPerformance(fromStr, toStr);
  const userQuery = useUserPerformance(viewingOther ? selectedUserId : null, fromStr, toStr);

  const activeQuery = viewingOther ? userQuery : myQuery;

  const data = activeQuery.data as PerformanceResponse | undefined;

  return (
    <div className="flex flex-col gap-4">
      <ModuleHeader
        module="time"
        title="My Performance"
        description="Your time, productivity, and throughput across the selected period."
      />

      <Card className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        {isAdmin && (
          <div className="flex min-w-[220px] flex-col gap-1">
            <label className="text-xs uppercase tracking-wide text-slate-400">Viewing performance for</label>
            <Select
              value={selectedUserId || (selfId ?? "")}
              onValueChange={(v) => setSelectedUserId(v === selfId ? "" : v)}
              options={[
                ...(selfId ? [{ value: selfId, label: "Me" }] : []),
                ...users
                  .filter((u) => u.id !== selfId)
                  .map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName}` })),
              ]}
              placeholder="Select user"
            />
          </div>
        )}

        <div className="flex min-w-[200px] flex-col gap-1">
          <label className="text-xs uppercase tracking-wide text-slate-400">From</label>
          <DatePicker value={fromDate} onChange={setFromDate} />
        </div>

        <div className="flex min-w-[200px] flex-col gap-1">
          <label className="text-xs uppercase tracking-wide text-slate-400">To</label>
          <DatePicker value={toDate} onChange={setToDate} />
        </div>
      </Card>

      {activeQuery.isLoading ? (
        <LoadingState label="Loading performance..." />
      ) : activeQuery.isError || !data ? (
        <ErrorState label="Unable to load performance." />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Total hours" value={formatHours(data.totalMinutes)} />
            <KpiCard label="Billable hours" value={formatHours(data.billableMinutes)} />
            <KpiCard
              label="Tasks completed"
              value={`${data.tasksCompleted ?? 0} / ${data.tasksTotal ?? 0}`}
            />
            <KpiCard
              label="Story points done"
              value={`${data.storyPointsCompleted ?? 0} / ${data.storyPointsTotal ?? 0}`}
            />
          </div>

          <ChartCard title="Time by day" description="Hours logged per day in the selected period">
            <TrendChart
              type="area"
              data={(data.byDay ?? []).map((d) => ({
                label: new Date(d.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
                value: Number((d.minutes / 60).toFixed(2)),
              }))}
              formatValue={(n) => `${n.toFixed(1)}h`}
            />
          </ChartCard>

          <ChartCard title="Time by project" description="Where your hours went">
            <HorizontalBarChart
              data={(data.byProject ?? []).map((p) => ({
                label: p.project.name,
                value: Number((p.minutes / 60).toFixed(2)),
              }))}
              formatValue={(n) => `${n.toFixed(1)}h`}
            />
          </ChartCard>
        </>
      )}
    </div>
  );
}
