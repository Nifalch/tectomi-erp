"use client";

import Link from "next/link";
import { FolderKanban, Plus } from "lucide-react";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDashboardSummary } from "@/lib/api/hooks";

const statusConfig = [
  { key: "PLANNING", label: "Planning", color: "bg-blue-500" },
  { key: "ACTIVE", label: "Active", color: "bg-emerald-500" },
  { key: "ON_HOLD", label: "On Hold", color: "bg-amber-500" },
  { key: "COMPLETED", label: "Completed", color: "bg-slate-400" },
];

export function ProjectBoard() {
  const { data } = useDashboardSummary();

  const taskBoard = (data?.taskBoard ?? []) as Array<{ status: string; _count: number }>;
  const totalProjects = taskBoard.reduce((acc, t) => acc + (t._count ?? 0), 0);

  return (
    <Card className="card-hover">
      <div className="flex items-center justify-between">
        <div>
          <CardDescription>Delivery flow</CardDescription>
          <CardTitle className="mt-1">Project status board</CardTitle>
        </div>
        <Link
          href="/projects"
          className="inline-flex items-center gap-1 rounded-lg border border-border/80 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white transition"
        >
          <Plus className="size-3" />
          <span>New Project</span>
        </Link>
      </div>

      {totalProjects === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-border/80 bg-slate-50/50 p-6 text-center dark:bg-slate-900/30">
          <FolderKanban className="mx-auto size-6 text-slate-400" />
          <p className="mt-2 text-xs font-medium text-slate-700 dark:text-slate-300">No active projects yet</p>
          <p className="text-[11px] text-slate-400">Create your first client project to track delivery milestones.</p>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3">
          {statusConfig.map((s) => {
            const count = taskBoard.find((t) => t.status === s.key)?._count ?? 0;
            return (
              <div key={s.key} className="rounded-xl border border-border/60 bg-slate-50/40 p-3 dark:bg-slate-900/20">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{s.label}</span>
                  <Badge tone="neutral" size="sm">{count}</Badge>
                </div>
                <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div className={`h-full rounded-full ${s.color}`} style={{ width: `${Math.min(count * 10, 100)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
