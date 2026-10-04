"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useEmployeeProjects } from "@/lib/api/employee-profile";

export function ProjectsTab({ userId }: { userId: string }) {
  const q = useEmployeeProjects(userId);
  if (q.isLoading) return <LoadingState label="Loading projects..." />;
  if (q.isError || !q.data) return <ErrorState label="Unable to load project data." />;

  const projects = q.data.projects as Array<{ id: string; name: string; status: string; role: "MEMBER" | "MANAGER"; startDate?: string; endDate?: string }>;
  const tasks = q.data.openTasks as Array<{ id: string; title: string; status: string; dueDate?: string; project?: { name: string } }>;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <h3 className="mb-3 font-semibold">Projects ({projects.length}) · {q.data.completedTaskCount} completed tasks</h3>
        {projects.length === 0 ? (
          <p className="text-sm text-slate-500">No projects.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {projects.map((p) => (
              <li key={`${p.id}-${p.role}`} className="flex items-center justify-between rounded-xl border border-slate-100 p-3 dark:border-slate-800">
                <div>
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="text-xs text-slate-500">{p.status}</div>
                </div>
                <Badge tone={p.role === "MANAGER" ? "info" : "neutral"} size="sm">{p.role}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <h3 className="mb-3 font-semibold">Open tasks ({tasks.length})</h3>
        {tasks.length === 0 ? (
          <p className="text-sm text-slate-500">No open tasks.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {tasks.map((t) => (
              <li key={t.id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3 dark:border-slate-800">
                <div>
                  <div className="text-sm font-medium">{t.title}</div>
                  {t.project && <div className="text-xs text-slate-500">{t.project.name}</div>}
                </div>
                <div className="flex items-center gap-2">
                  {t.dueDate && <span className="text-xs text-slate-500">{new Date(t.dueDate).toLocaleDateString()}</span>}
                  <Badge tone="warning" size="sm">{t.status}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
