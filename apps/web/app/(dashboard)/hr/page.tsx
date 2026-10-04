"use client";

import { useState } from "react";
import { ModuleHeader } from "@/components/layout/module-header";
import { ChartCard, DonutChart, TrendChart, CHART_COLORS } from "@/components/charts";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { AddEmployeeDialog } from "@/components/hr/add-employee-dialog";
import { QuickActionsBar } from "@/components/hr/hub/quick-actions-bar";
import { KpiStrip } from "@/components/hr/hub/kpi-strip";
import { ApprovalsQueue } from "@/components/hr/hub/approvals-queue";
import { AlertsPanel } from "@/components/hr/hub/alerts-panel";
import { Celebrations } from "@/components/hr/hub/celebrations";
import { OnboardingQueue } from "@/components/hr/hub/onboarding-queue";
import { UpcomingReviews } from "@/components/hr/hub/upcoming-reviews";
import { DirectorySnapshot } from "@/components/hr/hub/directory-snapshot";
import { OrgChartPreview } from "@/components/hr/hub/org-chart-preview";
import { useHrHub } from "@/lib/api/hr-hub";

export default function HrPage() {
  const q = useHrHub();
  const [addOpen, setAddOpen] = useState(false);

  if (q.isLoading) return <LoadingState label="Loading HR hub..." />;
  if (q.isError || !q.data) return <ErrorState label="Unable to load HR hub." />;

  const h = q.data;

  return (
    <div className="flex flex-col gap-6">
      <ModuleHeader
        module="hr"
        title="People Operations"
        description="Operational hub for HR — approvals, alerts, headcount, and quick actions."
        counts={[
          { label: "headcount", value: h.kpis.headcount },
          { label: "pending leaves", value: h.pendingApprovals.length },
        ]}
      />

      <QuickActionsBar onAddEmployee={() => setAddOpen(true)} />
      <KpiStrip kpis={h.kpis} />

      <section className="grid gap-4 md:grid-cols-2">
        <ApprovalsQueue items={h.pendingApprovals} />
        <AlertsPanel alerts={h.alerts} />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Celebrations anniversaries={h.anniversaries} />
        <OnboardingQueue items={h.onboarding} />
      </section>

      <UpcomingReviews reviews={h.upcomingReviews} />

      <section className="grid gap-4 md:grid-cols-2">
        <ChartCard title="Employees by Department">
          <DonutChart
            data={h.charts.departmentBreakdown}
            total={h.kpis.headcount.toString()}
            totalLabel="people"
            height={240}
          />
        </ChartCard>
        <ChartCard title="Headcount Growth" description="Cumulative joins, last 12 months">
          <TrendChart data={h.charts.headcountTrend} color={CHART_COLORS.emerald} type="area" height={240} />
        </ChartCard>
        <ChartCard title="Leave Requests Over Time" description="Last 12 months">
          <TrendChart data={h.charts.leaveRequestsTrend} color={CHART_COLORS.amber} type="area" height={240} />
        </ChartCard>
        <div className="flex items-center justify-center rounded-lg border border-slate-200 p-6 dark:border-slate-800">
          <div className="text-center">
            <div className="text-xs uppercase text-slate-400">Attendance Rate (Month)</div>
            <div className="mt-1 text-3xl font-semibold">{h.charts.attendanceRateThisMonth}%</div>
            <div className="mt-1 text-[11px] text-slate-500">
              {h.charts.attendanceActualThisMonth} of {h.charts.attendanceExpectedThisMonth} expected check-ins
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <DirectorySnapshot snapshot={h.directorySnapshot} />
        <OrgChartPreview />
      </section>

      <AddEmployeeDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
