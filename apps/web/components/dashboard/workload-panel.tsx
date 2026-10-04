"use client";

import Link from "next/link";
import { Users2 } from "lucide-react";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useHrOverview } from "@/lib/api/hooks";

export function WorkloadPanel() {
  const { data } = useHrOverview();

  const employees = ((data?.employees ?? []) as Array<{
    user?: { firstName?: string; lastName?: string; email?: string };
    department?: string;
    designation?: string;
    performanceScore?: number;
  }>).slice(0, 5);

  return (
    <Card className="card-hover">
      <div className="flex items-center justify-between">
        <div>
          <CardDescription>Resource allocation</CardDescription>
          <CardTitle className="mt-1">Team overview</CardTitle>
        </div>
        <Link
          href="/hr"
          className="text-xs font-medium text-primary hover:underline"
        >
          View all ({data?.metrics?.employeeCount ?? employees.length})
        </Link>
      </div>

      <div className="mt-5 flex flex-col gap-3.5">
        {employees.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/80 bg-slate-50/50 p-6 text-center dark:bg-slate-900/30">
            <Users2 className="mx-auto size-6 text-slate-400" />
            <p className="mt-2 text-xs font-medium text-slate-700 dark:text-slate-300">No team members</p>
          </div>
        ) : (
          employees.map((emp, i) => {
            const firstName = emp.user?.firstName ?? "Team";
            const lastName = emp.user?.lastName ?? "Member";
            const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
            const score = Number(emp.performanceScore ?? 5);
            const utilization = Math.min(Math.round(score * 20), 100);

            return (
              <div key={i} className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-slate-50/40 p-2.5 dark:bg-slate-900/20">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-orange-500/10 font-semibold text-xs text-orange-600 dark:bg-orange-500/20 dark:text-orange-400">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {firstName} {lastName}
                    </p>
                    <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                      {emp.designation || emp.department || "Team Member"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end shrink-0 w-20">
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">{utilization}% capacity</span>
                  <Progress value={utilization} className="mt-1 h-1.5 w-full" />
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
