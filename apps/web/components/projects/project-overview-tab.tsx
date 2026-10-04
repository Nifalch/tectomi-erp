"use client";

import { useState } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatCurrency } from "@/lib/utils";
import { useAuthStore } from "@/lib/store/auth-store";
import { Sparkles } from "lucide-react";
import { AiPlanDialog } from "@/components/projects/ai-plan-dialog";

interface ProjectOverviewTabProps {
  project: {
    id: string;
    description?: string;
    status: string;
    budget?: number;
    startDate?: string;
    endDate?: string;
    client?: { companyName: string; email?: string; phone?: string };
    manager: { firstName: string; lastName: string; email: string };
    members: Array<{ user: { firstName: string; lastName: string } }>;
    milestones: Array<{ id: string; title: string; status: string; dueDate?: string }>;
  };
}

export function ProjectOverviewTab({ project }: ProjectOverviewTabProps) {
  const roles = useAuthStore((s) => s.user?.roles ?? []);
  const canSeeFinance = roles.some((r) =>
    ["SUPER_ADMIN", "ADMIN", "FINANCE_MANAGER", "PROJECT_MANAGER"].includes(r),
  );
  const canGeneratePlan = roles.some((r) =>
    ["SUPER_ADMIN", "ADMIN", "PROJECT_MANAGER"].includes(r),
  );
  const [aiOpen, setAiOpen] = useState(false);

  // Surface the "Generate plan with AI" banner only when there's room
  // for it — i.e. the project has zero milestones today. Once a plan
  // exists, the user can still trigger AI generation from anywhere
  // else, but a permanent banner would become noisy.
  const showAiBanner = canGeneratePlan && project.milestones.length === 0;

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      {showAiBanner && (
        <div className="xl:col-span-3">
          <Card className="relative overflow-hidden bg-gradient-to-br from-amber-50 via-rose-50/40 to-amber-50/40 dark:from-amber-950/30 dark:via-rose-950/20 dark:to-amber-950/20">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-amber-500/15 p-2.5 text-amber-600 dark:text-amber-300">
                  <Sparkles className="size-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Plan this project with AI</h3>
                  <p className="mt-1 max-w-2xl text-xs text-slate-600 dark:text-slate-300">
                    Describe what the client wants and Tectomi&apos;s AI will propose milestones, tasks, hour estimates, due dates, and balanced assignments across your team. Fully editable before save.
                  </p>
                </div>
              </div>
              <Button onClick={() => setAiOpen(true)}>
                <Sparkles className="mr-2 size-4" />
                Generate plan with AI
              </Button>
            </div>
          </Card>
        </div>
      )}
      <AiPlanDialog open={aiOpen} onOpenChange={setAiOpen} projectId={project.id} />
      <div className="space-y-6 xl:col-span-2">
        <Card>
          <CardTitle>Details</CardTitle>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{project.description || "No description provided."}</p>
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-xs uppercase tracking-wider text-slate-400">Status</span>
              <div className="mt-1"><StatusBadge status={project.status} /></div>
            </div>
            {canSeeFinance && (
              <div>
                <span className="text-xs uppercase tracking-wider text-slate-400">Budget</span>
                <div className="mt-1 font-semibold">{project.budget ? formatCurrency(project.budget) : "—"}</div>
              </div>
            )}
            <div>
              <span className="text-xs uppercase tracking-wider text-slate-400">Start Date</span>
              <div className="mt-1">{project.startDate ? new Date(project.startDate).toLocaleDateString() : "—"}</div>
            </div>
            <div>
              <span className="text-xs uppercase tracking-wider text-slate-400">End Date</span>
              <div className="mt-1">{project.endDate ? new Date(project.endDate).toLocaleDateString() : "—"}</div>
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle>Milestones</CardTitle>
          {project.milestones.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No milestones yet.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {project.milestones.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-xl border border-border/50 px-4 py-3 text-sm">
                  <span className="font-medium">{m.title}</span>
                  <div className="flex items-center gap-3">
                    {m.dueDate && <span className="text-xs text-slate-500">{new Date(m.dueDate).toLocaleDateString()}</span>}
                    <StatusBadge status={m.status} size="sm" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="space-y-6">
        {canSeeFinance && project.client && (
          <Card>
            <CardTitle>Client</CardTitle>
            <div className="mt-3 text-sm">
              <div className="font-medium">{project.client.companyName}</div>
              {project.client.email && <div className="mt-1 text-slate-500">{project.client.email}</div>}
            </div>
          </Card>
        )}

        <Card>
          <CardTitle>Team</CardTitle>
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{project.manager.firstName} {project.manager.lastName}</span>
              <Badge tone="info" size="sm">PM</Badge>
            </div>
            {project.members.map((m, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span>{m.user.firstName} {m.user.lastName}</span>
                <Badge tone="neutral" size="sm">Member</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
