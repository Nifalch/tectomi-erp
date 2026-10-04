"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { ChartCard, HorizontalBarChart } from "@/components/charts";
import { useProjectTimeSummary, useProjectWorkload } from "@/lib/api/hooks";
import { formatHours } from "@/lib/utils";

interface ProjectTimeTabProps {
  projectId: string;
}

interface ByUserRow {
  user: { id: string; firstName: string; lastName: string };
  minutes: number;
  count: number;
}

interface ByTaskRow {
  task: { id: string; title: string; status: string };
  minutes: number;
  count: number;
}

interface SummaryResponse {
  totalMinutes: number;
  entryCount: number;
  byUser: ByUserRow[];
  byTask: ByTaskRow[];
}

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{value}</p>
    </Card>
  );
}

export function ProjectTimeTab({ projectId }: ProjectTimeTabProps) {
  const query = useProjectTimeSummary(projectId);
  const workloadQuery = useProjectWorkload(projectId);

  const data = (query.data as SummaryResponse | undefined) ?? undefined;
  const byUser = data?.byUser ?? [];
  const byTask = data?.byTask ?? [];

  // Merge workload context (task counts + estimated hours) with time
  // entries (logged hours) so the contribution panel shows each
  // person's plate + delivery alongside their actual logged effort.
  // Hook must run unconditionally — keep it above the early returns.
  const contribution = useMemo(() => {
    const workload = (workloadQuery.data as any) ?? {};
    const boxes: any[] = Array.isArray(workload.boxes) ? workload.boxes : [];
    const totalLoggedMinutes = byUser.reduce((s, u) => s + u.minutes, 0);
    const totalEstimatedHrs = boxes.reduce(
      (s, b) => s + Number(b.capacity?.committedHours ?? 0),
      0,
    );
    return boxes.map((b) => {
      const id = b.user.id;
      const loggedRow = byUser.find((u) => u.user.id === id);
      const loggedMins = loggedRow?.minutes ?? 0;
      const estHrs = Number(b.capacity?.committedHours ?? 0);
      const tasksDone = b.totals?.done ?? 0;
      const tasksTotal = b.totals?.tasks ?? 0;
      const taskProgressPct = tasksTotal > 0 ? Math.round((tasksDone / tasksTotal) * 100) : 0;
      const effortSharePct = totalEstimatedHrs > 0
        ? Math.round((estHrs / totalEstimatedHrs) * 100)
        : 0;
      const loggedSharePct = totalLoggedMinutes > 0
        ? Math.round((loggedMins / totalLoggedMinutes) * 100)
        : 0;
      return {
        userId: id,
        name: `${b.user.firstName ?? ""} ${b.user.lastName ?? ""}`.trim() || b.user.email,
        tasksTotal,
        tasksDone,
        taskProgressPct,
        estHrs,
        loggedMins,
        effortSharePct,
        loggedSharePct,
      };
    });
  }, [workloadQuery.data, byUser]);

  if (query.isLoading) return <LoadingState label="Loading time summary..." />;
  if (query.isError || !data) return <ErrorState label="Unable to load time summary." />;

  const userChartData = byUser.map((u) => ({
    label: `${u.user.firstName} ${u.user.lastName}`,
    value: Number((u.minutes / 60).toFixed(2)),
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Total hours" value={formatHours(data.totalMinutes)} />
        <KpiCard label="Entries logged" value={data.entryCount ?? 0} />
        <KpiCard label="Active users" value={byUser.length} />
      </div>

      <ChartCard title="Hours by team member" description="Time logged per person on this project">
        <HorizontalBarChart
          data={userChartData}
          formatValue={(n) => `${n.toFixed(1)}h`}
        />
      </ChartCard>

      {/* Per-person contribution — combines workload + logged time so
          the PM sees who's carrying how much and how it compares to
          the work actually delivered. */}
      <Card className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">
            Team contribution
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Tasks, planned effort, and logged time per person.
          </p>
        </div>
        {contribution.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            No team members yet — assign tasks to see contribution.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border/60 text-[10px] uppercase tracking-wider text-slate-400">
                  <th className="py-2 pr-3 font-semibold">Person</th>
                  <th className="py-2 pr-3 font-semibold">Tasks</th>
                  <th className="py-2 pr-3 font-semibold">Progress</th>
                  <th className="py-2 pr-3 font-semibold">Planned</th>
                  <th className="py-2 pr-3 font-semibold">Logged</th>
                  <th className="py-2 pr-3 text-right font-semibold">Share of effort</th>
                </tr>
              </thead>
              <tbody>
                {contribution.map((c) => (
                  <tr key={c.userId} className="border-b border-border/30 last:border-none">
                    <td className="py-2.5 pr-3 font-medium text-slate-800 dark:text-slate-200">
                      {c.name}
                    </td>
                    <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300 tabular-nums">
                      <span className="font-semibold">{c.tasksDone}</span>
                      <span className="text-slate-400"> / {c.tasksTotal}</span>
                    </td>
                    <td className="py-2.5 pr-3 w-32">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                          <div
                            className="h-full bg-emerald-500"
                            style={{ width: `${c.taskProgressPct}%` }}
                          />
                        </div>
                        <span className="text-[11px] tabular-nums text-slate-500">
                          {c.taskProgressPct}%
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 font-mono tabular-nums text-slate-600 dark:text-slate-300">
                      {c.estHrs.toFixed(0)}h
                    </td>
                    <td className="py-2.5 pr-3 font-mono tabular-nums text-slate-600 dark:text-slate-300">
                      {formatHours(c.loggedMins)}
                    </td>
                    <td className="py-2.5 pr-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                          <div
                            className="h-full bg-primary"
                            style={{ width: `${c.effortSharePct}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-semibold tabular-nums text-slate-700 dark:text-slate-300 w-9 text-right">
                          {c.effortSharePct}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <h3 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">Hours by task</h3>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Breakdown of time entries by task</p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border/60 text-xs uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-3 font-medium">Task</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Entries</th>
                <th className="py-2 pr-3 font-medium">Time logged</th>
              </tr>
            </thead>
            <tbody>
              {byTask.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-xs text-slate-400">
                    No time entries yet.
                  </td>
                </tr>
              ) : (
                byTask.map((row) => (
                  <tr key={row.task.id} className="border-b border-border/30 last:border-none">
                    <td className="py-2 pr-3 text-slate-900 dark:text-slate-100">{row.task.title}</td>
                    <td className="py-2 pr-3">
                      <StatusBadge status={row.task.status} size="sm" />
                    </td>
                    <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">{row.count}</td>
                    <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">{formatHours(row.minutes)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
