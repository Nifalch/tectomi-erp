"use client";

import { ModuleHeader } from "@/components/layout/module-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { ProjectBoard } from "@/components/dashboard/project-board";
import { WorkloadPanel } from "@/components/dashboard/workload-panel";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { PendingApprovals } from "@/components/dashboard/pending-approvals";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { FinanceHealth } from "@/components/dashboard/finance-health";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useDashboardSummary, useTasks, useProjects, useTeamAttendance } from "@/lib/api/hooks";
import { ChartCard, DonutChart, TrendChart, CHART_COLORS } from "@/components/charts";
import { useAuthStore } from "@/lib/store/auth-store";
import { formatCurrency, toArray } from "@/lib/utils";

const FINANCE_ROLES = ["SUPER_ADMIN", "ADMIN", "FINANCE_MANAGER"];
const MANAGEMENT_ROLES = ["SUPER_ADMIN", "ADMIN", "PROJECT_MANAGER", "HR_MANAGER", "FINANCE_MANAGER"];

export default function DashboardPage() {
  const summary = useDashboardSummary();
  const tasksQuery = useTasks();
  const projectsQuery = useProjects();
  const attendanceQuery = useTeamAttendance();
  const user = useAuthStore((s) => s.user);
  const role = user?.roles[0] ?? "EMPLOYEE";
  const userName = user?.firstName || user?.email?.split("@")[0] || "there";

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const canSeeFinance = FINANCE_ROLES.includes(role);
  const canSeeManagement = MANAGEMENT_ROLES.includes(role);

  if (summary.isLoading) return <LoadingState label="Loading dashboard..." />;
  if (summary.isError || !summary.data) return <ErrorState label="Unable to load dashboard metrics." />;

  const metrics = summary.data.metrics;

  // Employee-specific: get their assigned tasks
  const myTasks = toArray<{ id: string; title: string; status: string; priority: string; dueDate?: string; project: { name: string } }>(tasksQuery.data);
  const myInProgress = myTasks.filter((t) => t.status === "IN_PROGRESS");
  const myOverdue = myTasks.filter((t) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "DONE");

  return (
    <div className="flex flex-col gap-8">
      <ModuleHeader
        module="dashboard"
        title={`${greeting}, ${userName}`}
        description={canSeeManagement
          ? "Here's what's happening across Tectomi ERP today."
          : "Here's your work overview for today."
        }
      />

      {/* Stat cards — role-based */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {canSeeFinance ? (
          <>
            <StatCard title="Revenue" value={formatCurrency(Number(metrics.revenue) || 0)} delta="Live" />
            <StatCard title="Expenses" value={formatCurrency(Number(metrics.expenses) || 0)} delta="Live" />
          </>
        ) : (
          <>
            <StatCard title="My Tasks" value={String(myTasks.length)} />
            <StatCard title="In Progress" value={String(myInProgress.length)} />
          </>
        )}
        <StatCard title="Active Projects" value={String(metrics.activeProjects ?? 0)} />
        {canSeeFinance ? (
          <StatCard title="Pending Invoices" value={String(metrics.pendingInvoices ?? 0)} />
        ) : (
          <StatCard title="Overdue" value={String(myOverdue.length)} delta={myOverdue.length > 0 ? "Action needed" : undefined} />
        )}
      </section>

      {/* Employee view: show their tasks */}
      {!canSeeManagement && (
        <section>
          <Card>
            <CardTitle>My Current Tasks</CardTitle>
            {myTasks.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">No tasks assigned to you yet.</p>
            ) : (
              <div className="mt-4 space-y-2">
                {myTasks.slice(0, 8).map((task) => (
                  <div key={task.id} className="flex items-center justify-between rounded-xl border border-border/50 px-4 py-3 text-sm">
                    <div>
                      <span className="font-medium">{task.title}</span>
                      <span className="ml-2 text-xs text-slate-400">{task.project.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "DONE" && (
                        <Badge tone="destructive" size="sm">Overdue</Badge>
                      )}
                      <Badge tone={task.status === "DONE" ? "positive" : task.status === "IN_PROGRESS" ? "info" : "neutral"} size="sm">
                        {task.status.replace("_", " ")}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>
      )}

      {canSeeFinance && <FinanceHealth />}

      {canSeeManagement && (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <ChartCard title="Tasks by Status">
            <DonutChart
              data={(() => {
                const allTasks = toArray<{ status: string }>(tasksQuery.data);
                const buckets = ["BACKLOG", "TODO", "IN_PROGRESS", "REVIEW", "DONE", "BLOCKED"] as const;
                const palette = [CHART_COLORS.slate, CHART_COLORS.cyan, CHART_COLORS.primary, CHART_COLORS.amber, CHART_COLORS.emerald, CHART_COLORS.red];
                return buckets.map((s, i) => ({ label: s.replace("_", " "), value: allTasks.filter((t) => t.status === s).length, color: palette[i] })).filter((d) => d.value > 0);
              })()}
              total={String(toArray<unknown>(tasksQuery.data).length)}
              totalLabel="tasks"
              height={220}
            />
          </ChartCard>
          <ChartCard title="Projects by Status">
            <DonutChart
              data={(() => {
                const projects = toArray<{ status: string }>(projectsQuery.data);
                const buckets = ["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"] as const;
                const palette = [CHART_COLORS.cyan, CHART_COLORS.emerald, CHART_COLORS.amber, CHART_COLORS.primary, CHART_COLORS.red];
                return buckets.map((s, i) => ({ label: s.replace("_", " "), value: projects.filter((p) => p.status === s).length, color: palette[i] })).filter((d) => d.value > 0);
              })()}
              total={String(toArray<unknown>(projectsQuery.data).length)}
              totalLabel="projects"
              height={220}
            />
          </ChartCard>
          <ChartCard title="Weekly Team Attendance" description="Present count, last 7 days">
            <TrendChart
              data={(() => {
                const att = (attendanceQuery.data ?? []) as Array<{ date?: string; status?: string }>;
                const bucket: Record<string, number> = {};
                const today = new Date();
                for (let i = 6; i >= 0; i--) {
                  const d = new Date(today);
                  d.setDate(d.getDate() - i);
                  const key = d.toISOString().slice(0, 10);
                  bucket[key] = 0;
                }
                att.forEach((a) => {
                  if (!a.date) return;
                  const key = a.date.slice(0, 10);
                  if (!(key in bucket)) return;
                  if (a.status === "PRESENT" || a.status === "CLOCKED_IN" || a.status === "COMPLETED") bucket[key]++;
                });
                return Object.entries(bucket).map(([k, v]) => ({
                  label: new Date(k).toLocaleDateString("en-US", { weekday: "short" }),
                  value: v,
                }));
              })()}
              color={CHART_COLORS.violet}
              type="area"
              height={220}
            />
          </ChartCard>
        </section>
      )}

      {/* Management view: full dashboard */}
      {canSeeManagement && (
        <section className="grid gap-6 xl:grid-cols-[1fr_340px]">
          <div className="space-y-6">
            <div className="grid gap-4 xl:grid-cols-2">
              <ProjectBoard />
              <WorkloadPanel />
            </div>
            <ActivityFeed />
          </div>
          <div className="space-y-6">
            <QuickActions />
            <PendingApprovals metrics={metrics} />
          </div>
        </section>
      )}

      {/* Employee gets quick actions too */}
      {!canSeeManagement && (
        <section className="grid gap-6 md:grid-cols-2">
          <QuickActions />
          <ActivityFeed />
        </section>
      )}
    </div>
  );
}
