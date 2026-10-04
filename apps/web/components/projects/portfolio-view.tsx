"use client";

/**
 * Portfolio / health dashboard — extracted from the standalone /portfolio page
 * so it can be mounted as the "Health" tab on /projects.
 *
 * Shows cross-project status (on-track / at-risk / off-track), overdue counts,
 * and per-project progress. Read-only; clicking a row jumps to the project
 * detail page.
 */

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Progress } from "@/components/ui/progress";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { BarChart, ChartCard, DonutChart, CHART_COLORS } from "@/components/charts";
import { useProjectPortfolio } from "@/lib/api/hooks";
import { formatCurrency, cn } from "@/lib/utils";

type Health = "ON_TRACK" | "AT_RISK" | "OFF_TRACK";

interface PortfolioRow {
  id: string;
  name: string;
  status: string;
  managerId: string;
  manager: { firstName: string; lastName: string };
  startDate?: string;
  endDate?: string;
  budget?: number;
  taskTotals: { total: number; done: number; overdue: number; unassigned: number };
  storyPointsTotal: number;
  storyPointsDone: number;
  progressPercent: number;
  health: Health;
  activeSprintName: string | null;
  memberCount: number;
}

const HEALTH_CONFIG: Record<Health, { label: string; color: string; dot: string }> = {
  ON_TRACK: { label: "On track", color: CHART_COLORS.emerald, dot: "bg-emerald-500" },
  AT_RISK: { label: "At risk", color: CHART_COLORS.amber, dot: "bg-amber-500" },
  OFF_TRACK: { label: "Off track", color: CHART_COLORS.red, dot: "bg-rose-500" },
};

function KpiCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: "emerald" | "amber" | "rose" | "slate";
}) {
  const accentClass =
    accent === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : accent === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : accent === "rose"
          ? "text-rose-600 dark:text-rose-400"
          : "text-slate-900 dark:text-white";
  return (
    <Card>
      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className={cn("mt-2 text-2xl font-semibold tracking-tight", accentClass)}>{value}</p>
    </Card>
  );
}

export function PortfolioView() {
  const router = useRouter();
  const query = useProjectPortfolio();

  const rows = (query.data ?? []) as PortfolioRow[];
  const hasBudget = rows.length > 0 && rows[0].budget !== undefined;

  const healthCounts = useMemo(() => {
    const c = { ON_TRACK: 0, AT_RISK: 0, OFF_TRACK: 0 } as Record<Health, number>;
    for (const r of rows) c[r.health] = (c[r.health] ?? 0) + 1;
    return c;
  }, [rows]);

  const donutData = useMemo(
    () => [
      { label: "On track", value: healthCounts.ON_TRACK, color: CHART_COLORS.emerald },
      { label: "At risk", value: healthCounts.AT_RISK, color: CHART_COLORS.amber },
      { label: "Off track", value: healthCounts.OFF_TRACK, color: CHART_COLORS.red },
    ],
    [healthCounts],
  );

  const topOverdueData = useMemo(() => {
    return [...rows]
      .filter((r) => (r.taskTotals?.overdue ?? 0) > 0)
      .sort((a, b) => (b.taskTotals?.overdue ?? 0) - (a.taskTotals?.overdue ?? 0))
      .slice(0, 8)
      .map((r) => ({ label: r.name, value: r.taskTotals?.overdue ?? 0 }));
  }, [rows]);

  const columns = useMemo<ColumnDef<PortfolioRow, unknown>[]>(() => {
    const base: ColumnDef<PortfolioRow, unknown>[] = [
      {
        accessorKey: "name",
        header: "Project",
        cell: ({ row }) => <span className="font-medium text-slate-900 dark:text-white">{row.original.name}</span>,
      },
      {
        accessorKey: "health",
        header: "Health",
        filterFn: (row, id, value) => {
          if (!value || (Array.isArray(value) && value.length === 0)) return true;
          const v = Array.isArray(value) ? value : [value];
          return v.includes(row.getValue(id));
        },
        cell: ({ row }) => {
          const cfg = HEALTH_CONFIG[row.original.health];
          return (
            <div className="flex items-center gap-2">
              <span className={cn("inline-block size-2.5 rounded-full", cfg.dot)} />
              <span className="text-xs text-slate-700 dark:text-slate-200">{cfg.label}</span>
            </div>
          );
        },
      },
      {
        id: "progress",
        header: "Progress",
        cell: ({ row }) => (
          <div className="flex min-w-[120px] items-center gap-2">
            <Progress value={row.original.progressPercent ?? 0} className="w-24" />
            <span className="text-xs tabular-nums text-slate-500">{Math.round(row.original.progressPercent ?? 0)}%</span>
          </div>
        ),
      },
      {
        id: "tasks",
        header: "Tasks",
        cell: ({ row }) => {
          const t = row.original.taskTotals ?? { total: 0, done: 0 };
          return <span className="tabular-nums text-slate-600 dark:text-slate-300">{t.done}/{t.total} done</span>;
        },
      },
      {
        id: "overdue",
        header: "Overdue",
        cell: ({ row }) => {
          const o = row.original.taskTotals?.overdue ?? 0;
          return o > 0
            ? <span className="font-medium tabular-nums text-rose-600 dark:text-rose-400">{o}</span>
            : <span className="text-slate-400">—</span>;
        },
      },
      {
        id: "sprint",
        header: "Sprint",
        cell: ({ row }) => (
          <span className="text-slate-600 dark:text-slate-300">{row.original.activeSprintName ?? "—"}</span>
        ),
      },
      {
        id: "manager",
        header: "Manager",
        cell: ({ row }) => {
          const m = row.original.manager;
          return <span className="text-slate-600 dark:text-slate-300">{m ? `${m.firstName} ${m.lastName}` : "—"}</span>;
        },
      },
    ];
    if (hasBudget) {
      base.push({
        id: "budget",
        header: "Budget",
        cell: ({ row }) => {
          const b = row.original.budget;
          return b !== undefined && b !== null
            ? <span className="tabular-nums text-slate-600 dark:text-slate-300">{formatCurrency(Number(b))}</span>
            : <span className="text-slate-400">—</span>;
        },
      });
    }
    return base;
  }, [hasBudget]);

  if (query.isLoading) return <LoadingState label="Loading health overview..." />;
  if (query.isError) return <ErrorState label="Unable to load portfolio." />;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Total projects" value={rows.length} accent="slate" />
        <KpiCard label="On track" value={healthCounts.ON_TRACK} accent="emerald" />
        <KpiCard label="At risk" value={healthCounts.AT_RISK} accent="amber" />
        <KpiCard label="Off track" value={healthCounts.OFF_TRACK} accent="rose" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Projects by health" description="Distribution across all visible projects">
          <DonutChart data={donutData} total={String(rows.length)} totalLabel="Projects" />
        </ChartCard>
        <ChartCard title="Top projects by overdue tasks" description="Projects with the most overdue work">
          <BarChart data={topOverdueData} color={CHART_COLORS.red} />
        </ChartCard>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        searchPlaceholder="Search projects..."
        moduleColor="projects"
        onRowClick={(row) => router.push(`/projects/${row.id}`)}
        filterOptions={[
          {
            column: "health",
            label: "Health",
            options: [
              { value: "ON_TRACK", label: "On track" },
              { value: "AT_RISK", label: "At risk" },
              { value: "OFF_TRACK", label: "Off track" },
            ],
          },
        ]}
        emptyState={{ title: "No projects", description: "Projects will appear here once created." }}
      />
    </div>
  );
}
