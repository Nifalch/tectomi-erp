"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPatch, apiPost, apiDelete } from "@/lib/api/client";
import { ListPageLayout } from "@/components/layouts/list-page-layout";
import { GoalCard } from "./_components/goal-card";
import "./_components/goal-visuals.css";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useGoals } from "@/lib/api/hooks";
import { toast } from "@/lib/hooks/use-toast";
import { toArray } from "@/lib/utils";
import { useAuthStore } from "@/lib/store/auth-store";

interface GoalRow {
  id: string;
  title: string;
  description?: string;
  type: string;
  status: string;
  targetValue: number;
  currentValue: number;
  unit?: string;
  dueDate?: string;
  assigneeId: string;
  assignee?: { firstName: string; lastName: string };
}

const ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN"];

// The number inputs below register with `valueAsNumber: true` so the form
// state actually carries numbers — otherwise `type="number"` inputs ship
// strings and `z.number()` silently fails with a generic "Target required"
// even when the user has typed a value.
const schema = z.object({
  title: z.string().min(1, "Title required"),
  description: z.string().optional(),
  type: z.string().min(1, "Type required"),
  targetValue: z
    .number({ error: "Target required" })
    .refine((n) => !Number.isNaN(n), { message: "Target required" })
    .min(0, "Target must be 0 or more"),
  currentValue: z.number().optional(),
  unit: z.string().optional(),
  status: z.string().optional(),
  dueDate: z.date().optional(),
});
type FormValues = z.infer<typeof schema>;

export default function GoalsPage() {
  const query = useGoals();
  const qc = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const isAdmin = !!currentUser?.roles.some((r) => ADMIN_ROLES.includes(r));
  const canMutate = (row: GoalRow) => isAdmin || row.assigneeId === currentUser?.id;

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPost("/goals", data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["goals"] }); toast({ variant: "success", title: "Goal created" }); },
    onError: (err: Error) => toast({ variant: "error", title: "Failed to create goal", description: err?.message }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => apiPatch(`/goals/${id}`, data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["goals"] }); toast({ variant: "success", title: "Goal updated" }); },
    onError: (err: Error) => toast({ variant: "error", title: "Failed to update goal", description: err?.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/goals/${id}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["goals"] }); toast({ variant: "success", title: "Goal deleted" }); },
    onError: () => toast({ variant: "error", title: "Failed to delete goal" }),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [editGoal, setEditGoal] = useState<GoalRow | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<GoalRow | undefined>();
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { type: "GOAL", status: "NOT_STARTED", currentValue: 0 } });

  useEffect(() => {
    if (editGoal) {
      form.reset({
        title: editGoal.title,
        description: editGoal.description ?? "",
        type: editGoal.type,
        status: editGoal.status,
        targetValue: Number(editGoal.targetValue ?? 0),
        currentValue: Number(editGoal.currentValue ?? 0),
        unit: editGoal.unit ?? "",
        dueDate: editGoal.dueDate ? new Date(editGoal.dueDate) : undefined,
      });
    }
  }, [editGoal, form]);

  // All hooks must be declared before any early returns to satisfy React's
  // Rules of Hooks (loading/error branches below must not change hook order).
  const [filterPill, setFilterPill] = useState<"all" | "mine" | "in_progress" | "completed">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const goals = useMemo(() => toArray<GoalRow>(query.data ?? []), [query.data]);

  const counts = useMemo(() => ({
    inProgress: goals.filter((g) => g.status === "IN_PROGRESS").length,
    notStarted: goals.filter((g) => g.status === "NOT_STARTED").length,
    completed: goals.filter((g) => g.status === "COMPLETED").length,
    total: goals.filter((g) => g.status !== "CANCELLED").length,
  }), [goals]);

  const filteredGoals = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return goals.filter((g) => {
      if (filterPill === "mine" && g.assigneeId !== currentUser?.id) return false;
      if (filterPill === "in_progress" && g.status !== "IN_PROGRESS") return false;
      if (filterPill === "completed" && g.status !== "COMPLETED") return false;
      if (q && !g.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [goals, filterPill, searchQuery, currentUser?.id]);

  const sections: Array<{ type: "KPI" | "OKR" | "GOAL"; items: GoalRow[] }> = useMemo(() => {
    return [
      { type: "KPI",  items: filteredGoals.filter((g) => g.type === "KPI") },
      { type: "OKR",  items: filteredGoals.filter((g) => g.type === "OKR") },
      { type: "GOAL", items: filteredGoals.filter((g) => g.type === "GOAL") },
    ];
  }, [filteredGoals]);

  if (query.isLoading) return <LoadingState label="Loading goals..." />;
  if (query.isError || !query.data) return <ErrorState label="Unable to load goals." />;

  const isEdit = !!editGoal;
  const resetForm = () => form.reset({ type: "GOAL", status: "NOT_STARTED", currentValue: 0 });

  const onSubmit = (values: FormValues) => {
    const payload = { ...values, dueDate: values.dueDate?.toISOString() };
    if (isEdit && editGoal) {
      updateMutation.mutate(
        { id: editGoal.id, data: payload },
        { onSuccess: () => { setCreateOpen(false); setEditGoal(undefined); resetForm(); } },
      );
    } else {
      createMutation.mutate(
        payload,
        { onSuccess: () => { setCreateOpen(false); resetForm(); } },
      );
    }
  };

  return (
    <ListPageLayout
      module="dashboard"
      title="Goals & KPIs"
      description="Track goals, OKRs, and key performance indicators."
      primaryAction={{ label: "New Goal", icon: <Plus className="mr-1 size-4" />, onClick: () => { setEditGoal(undefined); resetForm(); setCreateOpen(true); } }}
      counts={[
        { label: "total", value: counts.total },
      ]}
    >
      <div className="goals-surface space-y-6">
        {/* Hero tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="hero-tile in-progress">
            <div className="label">In Progress</div>
            <div className="num">{counts.inProgress}</div>
          </div>
          <div className="hero-tile not-started">
            <div className="label">Not Started</div>
            <div className="num">{counts.notStarted}</div>
          </div>
          <div className="hero-tile completed">
            <div className="label">Completed</div>
            <div className="num">{counts.completed}</div>
          </div>
          <div className="hero-tile total">
            <div className="label">Total</div>
            <div className="num">{counts.total}</div>
          </div>
        </div>

        {/* Filter + search */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {([
              { id: "all", label: "All" },
              { id: "mine", label: "Mine" },
              { id: "in_progress", label: "In progress" },
              { id: "completed", label: "Completed" },
            ] as const).map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={filterPill === p.id}
                onClick={() => setFilterPill(p.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  filterPill === p.id
                    ? "bg-orange-500 text-white shadow-sm"
                    : "bg-white/70 text-slate-600 hover:bg-white dark:bg-slate-800/70 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="sm:w-72">
            <Input
              placeholder="Search goals..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Empty state */}
        {filteredGoals.length === 0 && (
          <div className="glass-card p-10 text-center">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {goals.length === 0 ? "No goals yet" : "No goals match your filters"}
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {goals.length === 0
                ? "Create your first goal to start tracking."
                : "Try a different filter or clear the search."}
            </p>
          </div>
        )}

        {/* Sections — cards go in next task */}
        {sections.map((section) => (
          section.items.length > 0 && (
            <section key={section.type} className="space-y-3">
              <div className="flex items-center gap-2">
                <span className={`section-accent ${section.type.toLowerCase()}`} />
                <h2 className="text-sm font-semibold tracking-wide text-slate-700 dark:text-slate-200">
                  {section.type} <span className="text-slate-400 font-medium">· {section.items.length}</span>
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {section.items.map((g) => (
                  <GoalCard
                    key={g.id}
                    goal={{
                      id: g.id,
                      title: g.title,
                      type: g.type as "KPI" | "OKR" | "GOAL",
                      status: g.status as "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED",
                      targetValue: g.targetValue,
                      currentValue: g.currentValue,
                      unit: g.unit,
                      dueDate: g.dueDate,
                      assignee: g.assignee,
                    }}
                    canMutate={canMutate(g)}
                    onEdit={() => { setEditGoal(g); setCreateOpen(true); }}
                    onDelete={() => setDeleteTarget(g)}
                  />
                ))}
              </div>
            </section>
          )
        ))}
      </div>

      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) { setEditGoal(undefined); resetForm(); } }}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>{isEdit ? "Edit Goal" : "New Goal"}</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField label="Title" required error={form.formState.errors.title?.message}>
              <Input {...form.register("title")} error={!!form.formState.errors.title} placeholder="Increase revenue by 20%" />
            </FormField>
            <FormField label="Description">
              <Input {...form.register("description")} placeholder="Optional description" />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Type" required>
                <Select value={form.watch("type")} onValueChange={(v) => form.setValue("type", v)}
                  options={[{ value: "GOAL", label: "Goal" }, { value: "OKR", label: "OKR" }, { value: "KPI", label: "KPI" }]} />
              </FormField>
              <FormField label="Status">
                <Select value={form.watch("status")} onValueChange={(v) => form.setValue("status", v)}
                  options={[
                    { value: "NOT_STARTED", label: "Not started" },
                    { value: "IN_PROGRESS", label: "In progress" },
                    { value: "COMPLETED", label: "Completed" },
                    { value: "CANCELLED", label: "Cancelled" },
                  ]} />
              </FormField>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <FormField label="Target Value" required error={form.formState.errors.targetValue?.message}>
                <Input
                  type="number"
                  step="any"
                  {...form.register("targetValue", { valueAsNumber: true })}
                  error={!!form.formState.errors.targetValue}
                  placeholder="100"
                />
              </FormField>
              <FormField label="Current Value">
                <Input
                  type="number"
                  step="any"
                  {...form.register("currentValue", { valueAsNumber: true })}
                  placeholder="0"
                />
              </FormField>
              <FormField label="Unit">
                <Input {...form.register("unit")} placeholder="%" />
              </FormField>
            </div>
            <FormField label="Due Date">
              <DatePicker value={form.watch("dueDate")} onChange={(d) => form.setValue("dueDate", d!)} />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {isEdit
                  ? (updateMutation.isPending ? "Saving..." : "Save Changes")
                  : (createMutation.isPending ? "Creating..." : "Create Goal")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(undefined); }}
        title="Delete goal" description={`Delete "${deleteTarget?.title}"? This cannot be undone.`} variant="destructive" confirmLabel="Delete"
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(undefined) }); }}
        loading={deleteMutation.isPending} />
    </ListPageLayout>
  );
}
