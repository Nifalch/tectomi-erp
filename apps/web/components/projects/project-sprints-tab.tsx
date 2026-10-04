"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Play, CheckCircle, Trash2, BarChart3 } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { StatusBadge } from "@/components/ui/status-badge";
import { useSprints, useProjectTasks, useSprintBurndown, useSprintRetrospective } from "@/lib/api/hooks";
import { useCreateSprint, useDeleteSprint, useSaveRetrospective } from "@/lib/api/mutations";
import { toArray } from "@/lib/utils";
import { apiPatch } from "@/lib/api/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BurndownChart, type BurndownDatum } from "@/components/charts/burndown-chart";
import { SprintVelocityChart } from "@/components/projects/sprint-velocity-chart";
import { useAuthStore } from "@/lib/store/auth-store";

interface Sprint {
  id: string;
  name: string;
  goal?: string;
  startDate: string;
  endDate: string;
  status: string;
  _count?: { tasks: number };
}

const schema = z.object({
  name: z.string().min(1, "Name required"),
  goal: z.string().optional(),
  startDate: z.date({ error: "Start date required" }),
  endDate: z.date({ error: "End date required" }),
});
type FormValues = z.infer<typeof schema>;

function SprintBurndownPanel({ sprintId }: { sprintId: string }) {
  const burndownQuery = useSprintBurndown(sprintId);

  // Field names must match the backend's getBurndown response:
  //   snapshots: [{ date, pointsCompleted, pointsRemaining, tasksCompleted, tasksRemaining }]
  //   ideal:     [{ date, points }]
  const raw = (burndownQuery.data ?? {}) as {
    snapshots?: Array<{
      date?: string;
      pointsCompleted?: number;
      pointsRemaining?: number;
      tasksCompleted?: number;
      tasksRemaining?: number;
    }>;
    ideal?: Array<{ date?: string; points?: number }>;
  };
  const snapshots = raw.snapshots ?? [];
  const ideal = raw.ideal ?? [];

  const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString() : "");

  const data: BurndownDatum[] = [];
  const len = Math.max(snapshots.length, ideal.length);
  for (let i = 0; i < len; i++) {
    const s = snapshots[i];
    const ide = ideal[i];
    const label = fmtDate(s?.date) || fmtDate(ide?.date) || `Day ${i + 1}`;
    data.push({
      label,
      remaining: typeof s?.pointsRemaining === "number" ? s.pointsRemaining : undefined,
      ideal: typeof ide?.points === "number" ? ide.points : undefined,
    });
  }

  const last = snapshots.length > 0 ? snapshots[snapshots.length - 1] : undefined;

  return (
    <div className="mt-4 border-t border-border/50 pt-3">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Burndown</h4>
        {/* Today's totals are auto-captured on every view — no manual button. */}
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg border border-border/40 p-2">
          <div className="text-[10px] uppercase text-slate-400">Points done</div>
          <div className="text-lg font-semibold">{last?.pointsCompleted ?? "—"}</div>
        </div>
        <div className="rounded-lg border border-border/40 p-2">
          <div className="text-[10px] uppercase text-slate-400">Points remaining</div>
          <div className="text-lg font-semibold">{last?.pointsRemaining ?? "—"}</div>
        </div>
        <div className="rounded-lg border border-border/40 p-2">
          <div className="text-[10px] uppercase text-slate-400">Tasks done</div>
          <div className="text-lg font-semibold">{last?.tasksCompleted ?? "—"}</div>
        </div>
        <div className="rounded-lg border border-border/40 p-2">
          <div className="text-[10px] uppercase text-slate-400">Tasks remaining</div>
          <div className="text-lg font-semibold">{last?.tasksRemaining ?? "—"}</div>
        </div>
      </div>
      <BurndownChart data={data} />
    </div>
  );
}

function RetrospectiveSection({ sprintId, canEdit }: { sprintId: string; canEdit: boolean }) {
  const retroQuery = useSprintRetrospective(sprintId);
  const save = useSaveRetrospective();
  const [open, setOpen] = useState(false);
  const [wentWell, setWentWell] = useState("");
  const [toImprove, setToImprove] = useState("");
  const [actionItems, setActionItems] = useState("");

  const data = retroQuery.data as
    | { wentWell?: string; toImprove?: string; actionItems?: string }
    | null
    | undefined;

  const openEditor = () => {
    setWentWell(data?.wentWell ?? "");
    setToImprove(data?.toImprove ?? "");
    setActionItems(data?.actionItems ?? "");
    setOpen(true);
  };

  const handleSave = () => {
    save.mutate(
      { sprintId, data: { wentWell, toImprove, actionItems } },
      { onSuccess: () => setOpen(false) },
    );
  };

  return (
    <div className="mt-4 border-t border-border/50 pt-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Retrospective</h4>
        {canEdit && (
          <Button size="sm" variant="secondary" onClick={openEditor}>
            {data ? "Edit" : "Add retrospective"}
          </Button>
        )}
      </div>
      {retroQuery.isLoading ? (
        <div className="text-xs text-slate-400">Loading…</div>
      ) : data ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-2 dark:border-emerald-900 dark:bg-emerald-950/20">
            <div className="text-[10px] font-semibold uppercase text-emerald-600 dark:text-emerald-400">Went well</div>
            <div className="mt-1 whitespace-pre-wrap text-xs text-slate-700 dark:text-slate-300">
              {data.wentWell || <span className="italic text-slate-400">—</span>}
            </div>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-2 dark:border-amber-900 dark:bg-amber-950/20">
            <div className="text-[10px] font-semibold uppercase text-amber-600 dark:text-amber-400">To improve</div>
            <div className="mt-1 whitespace-pre-wrap text-xs text-slate-700 dark:text-slate-300">
              {data.toImprove || <span className="italic text-slate-400">—</span>}
            </div>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-2 dark:border-blue-900 dark:bg-blue-950/20">
            <div className="text-[10px] font-semibold uppercase text-blue-600 dark:text-blue-400">Action items</div>
            <div className="mt-1 whitespace-pre-wrap text-xs text-slate-700 dark:text-slate-300">
              {data.actionItems || <span className="italic text-slate-400">—</span>}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-xs text-slate-400">No retrospective yet.</div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>Sprint Retrospective</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <FormField label="What went well?">
              <TextArea value={wentWell} onChange={(e) => setWentWell(e.target.value)} placeholder="Wins and things we should keep doing…" />
            </FormField>
            <FormField label="What to improve?">
              <TextArea value={toImprove} onChange={(e) => setToImprove(e.target.value)} placeholder="Pain points, blockers, friction…" />
            </FormField>
            <FormField label="Action items">
              <TextArea value={actionItems} onChange={(e) => setActionItems(e.target.value)} placeholder="Concrete changes we will try next sprint…" />
            </FormField>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" onClick={handleSave} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ProjectSprintsTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const sprintsQuery = useSprints(projectId);
  const tasksQuery = useProjectTasks(projectId);
  const createMutation = useCreateSprint();
  const deleteMutation = useDeleteSprint();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Sprint | undefined>();
  const [burndownFor, setBurndownFor] = useState<string | null>(null);
  const roles = useAuthStore((s) => s.user?.roles ?? []);
  const canEditRetro = roles.some((r) => r === "SUPER_ADMIN" || r === "ADMIN" || r === "PROJECT_MANAGER");
  const form = useForm<FormValues>({ resolver: zodResolver(schema) });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => apiPatch(`/sprints/${id}`, { status }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["sprints"] }),
  });

  const sprints = toArray<Sprint>(sprintsQuery.data);
  const allTasks = toArray<{ id: string; title: string; status: string; sprintId?: string; storyPoints?: number }>(tasksQuery.data);

  const onSubmit = (values: FormValues) => {
    createMutation.mutate({
      projectId,
      name: values.name,
      goal: values.goal,
      startDate: values.startDate.toISOString(),
      endDate: values.endDate.toISOString(),
    }, { onSuccess: () => { setCreateOpen(false); form.reset(); } });
  };

  return (
    <div className="space-y-4">
      <SprintVelocityChart projectId={projectId} />

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Sprints</h3>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 size-4" /> New Sprint
        </Button>
      </div>

      {sprints.length === 0 ? (
        <Card><div className="py-8 text-center text-sm text-slate-400">No sprints yet. Create your first sprint to start planning.</div></Card>
      ) : (
        <div className="space-y-3">
          {sprints.map((sprint) => {
            const sprintTasks = allTasks.filter((t) => t.sprintId === sprint.id);
            const completed = sprintTasks.filter((t) => t.status === "DONE").length;
            const totalPoints = sprintTasks.reduce((s, t) => s + (Number(t.storyPoints) || 0), 0);
            const completedPoints = sprintTasks.filter((t) => t.status === "DONE").reduce((s, t) => s + (Number(t.storyPoints) || 0), 0);

            return (
              <Card key={sprint.id}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <CardTitle>{sprint.name}</CardTitle>
                      <Badge tone={sprint.status === "ACTIVE" ? "positive" : sprint.status === "COMPLETED" ? "info" : "neutral"} size="sm" dot>
                        {sprint.status}
                      </Badge>
                    </div>
                    {sprint.goal && <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{sprint.goal}</p>}
                    <div className="mt-2 flex items-center gap-4 text-xs text-slate-500">
                      <span>{new Date(sprint.startDate).toLocaleDateString()} → {new Date(sprint.endDate).toLocaleDateString()}</span>
                      <span>{sprintTasks.length} tasks</span>
                      <span>{completed}/{sprintTasks.length} done</span>
                      {totalPoints > 0 && <span>{completedPoints}/{totalPoints} points</span>}
                    </div>
                    {sprintTasks.length > 0 && (
                      <div className="mt-3 h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(completed / sprintTasks.length) * 100}%` }} />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {sprint.status === "PLANNED" && (
                      <Button size="sm" variant="secondary" onClick={() => statusMutation.mutate({ id: sprint.id, status: "ACTIVE" })}>
                        <Play className="mr-1 size-3" /> Start
                      </Button>
                    )}
                    {sprint.status === "ACTIVE" && (
                      <Button size="sm" variant="secondary" onClick={() => statusMutation.mutate({ id: sprint.id, status: "COMPLETED" })}>
                        <CheckCircle className="mr-1 size-3" /> Complete
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setBurndownFor(burndownFor === sprint.id ? null : sprint.id)}
                    >
                      <BarChart3 className="size-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(sprint)}>
                      <Trash2 className="size-4 text-red-500" />
                    </Button>
                  </div>
                </div>

                {burndownFor === sprint.id && (
                  <SprintBurndownPanel sprintId={sprint.id} />
                )}

                {(sprint.status === "ACTIVE" || sprint.status === "COMPLETED") && (
                  <RetrospectiveSection sprintId={sprint.id} canEdit={canEditRetro} />
                )}

                {sprintTasks.length > 0 && (
                  <div className="mt-4 space-y-1 border-t border-border/50 pt-3">
                    {sprintTasks.slice(0, 5).map((t) => (
                      <div key={t.id} className="flex items-center justify-between text-sm">
                        <span className="truncate">{t.title}</span>
                        <StatusBadge status={t.status} size="sm" />
                      </div>
                    ))}
                    {sprintTasks.length > 5 && <div className="text-xs text-slate-400">+ {sprintTasks.length - 5} more</div>}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>New Sprint</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField label="Sprint Name" required error={form.formState.errors.name?.message}>
              <Input {...form.register("name")} placeholder="Sprint 1 — Q2 Launch" error={!!form.formState.errors.name} />
            </FormField>
            <FormField label="Goal">
              <TextArea {...form.register("goal")} placeholder="What is the team trying to achieve this sprint?" />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Start Date" required error={form.formState.errors.startDate?.message}>
                <DatePicker value={form.watch("startDate")} onChange={(d) => form.setValue("startDate", d!)} />
              </FormField>
              <FormField label="End Date" required error={form.formState.errors.endDate?.message}>
                <DatePicker value={form.watch("endDate")} onChange={(d) => form.setValue("endDate", d!)} minDate={form.watch("startDate")} />
              </FormField>
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? "Creating..." : "Create Sprint"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(undefined)}
        title="Delete sprint"
        description={`Delete sprint "${deleteTarget?.name}"? Tasks will not be deleted.`}
        variant="destructive"
        confirmLabel="Delete"
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(undefined) }); }}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
