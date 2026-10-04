"use client";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, Pencil } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost, apiPatch, apiDelete } from "@/lib/api/client";
import { useProjectMilestones } from "@/lib/api/hooks";
import { toast } from "@/lib/hooks/use-toast";
import { toArray } from "@/lib/utils";

interface Milestone {
  id: string;
  title: string;
  description?: string;
  dueDate?: string;
  status: string;
}

const schema = z.object({
  title: z.string().min(1, "Title required"),
  description: z.string().optional(),
  dueDate: z.date().optional(),
  status: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

const STATUS_OPTIONS = [
  { value: "NOT_STARTED", label: "Not Started" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "DONE", label: "Done" },
];

export function ProjectMilestonesTab({
  projectId,
  milestones: initialMilestones,
}: {
  projectId: string;
  /** Initial data from the parent `useProject` cache — used to render
   *  immediately before our own query resolves. Once the dedicated query
   *  returns, we switch to that source so create/update/delete reflect
   *  instantly without waiting for the parent project to refetch. */
  milestones: Milestone[];
}) {
  const qc = useQueryClient();
  // Own query, scoped to project milestones, so mutations can target
  // its cache key directly and we get fresh data without waiting for
  // a full `useProject` refetch.
  const milestonesQuery = useProjectMilestones(projectId);
  const milestones = useMemo<Milestone[]>(() => {
    if (milestonesQuery.data) return toArray<Milestone>(milestonesQuery.data);
    return initialMilestones;
  }, [milestonesQuery.data, initialMilestones]);
  const [createOpen, setCreateOpen] = useState(false);
  // When set, opens the edit dialog pre-filled with this milestone.
  // The form is shared with the create flow so the fields stay in sync.
  const [editTarget, setEditTarget] = useState<Milestone | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Milestone | undefined>();
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { status: "NOT_STARTED" } });

  // Reset form whenever the dialog mode changes.
  useEffect(() => {
    if (editTarget) {
      form.reset({
        title: editTarget.title,
        description: editTarget.description ?? "",
        dueDate: editTarget.dueDate ? new Date(editTarget.dueDate) : undefined,
        status: editTarget.status ?? "NOT_STARTED",
      });
    } else if (createOpen) {
      form.reset({ status: "NOT_STARTED" });
    }
  }, [editTarget, createOpen, form]);

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPost(`/projects/${projectId}/milestones`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["project", projectId] });
      void qc.invalidateQueries({ queryKey: ["project-milestones", projectId] });
      toast({ variant: "success", title: "Milestone created" });
    },
    onError: () => toast({ variant: "error", title: "Failed to create milestone" }),
  });

  // Inline-quick status toggle on a row, e.g. when you just need to
  // flip a milestone to DONE without opening the full edit dialog.
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiPatch(`/projects/${projectId}/milestones/${id}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["project", projectId] });
      void qc.invalidateQueries({ queryKey: ["project-milestones", projectId] });
      toast({ variant: "success", title: "Milestone updated" });
    },
    onError: () => toast({ variant: "error", title: "Failed to update milestone" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/projects/${projectId}/milestones/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["project", projectId] });
      void qc.invalidateQueries({ queryKey: ["project-milestones", projectId] });
      toast({ variant: "success", title: "Milestone deleted" });
    },
  });

  const submitForm = (values: FormValues) => {
    const payload = {
      title: values.title,
      description: values.description,
      dueDate: values.dueDate?.toISOString(),
      status: values.status,
    };
    if (editTarget) {
      updateMutation.mutate(
        { id: editTarget.id, data: payload },
        { onSuccess: () => setEditTarget(null) },
      );
    } else {
      createMutation.mutate(payload, { onSuccess: () => setCreateOpen(false) });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Milestones</h3>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 size-4" /> New Milestone
        </Button>
      </div>

      {milestones.length === 0 ? (
        <Card><div className="py-8 text-center text-sm text-slate-400">No milestones yet.</div></Card>
      ) : (
        <div className="space-y-2">
          {milestones.map((m) => (
            <Card key={m.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <CardTitle>{m.title}</CardTitle>
                  {m.description && <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{m.description}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                    {m.dueDate && <span className="text-slate-500">Due: {new Date(m.dueDate).toLocaleDateString()}</span>}
                    {/* Inline status switcher — the most common edit, so
                        we expose it without opening the dialog. */}
                    <div className="w-44">
                      <Select
                        value={m.status}
                        onValueChange={(v) => updateMutation.mutate({ id: m.id, data: { status: v } })}
                        options={STATUS_OPTIONS}
                      />
                    </div>
                    <StatusBadge status={m.status} size="sm" />
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditTarget(m)} title="Edit milestone">
                    <Pencil className="size-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(m)} title="Delete milestone">
                    <Trash2 className="size-4 text-red-500" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={createOpen || editTarget !== null}
        onOpenChange={(o) => {
          if (!o) {
            setCreateOpen(false);
            setEditTarget(null);
          }
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Edit Milestone" : "New Milestone"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(submitForm)} className="space-y-4">
            <FormField label="Title" required error={form.formState.errors.title?.message}>
              <Input {...form.register("title")} error={!!form.formState.errors.title} placeholder="MVP Release" />
            </FormField>
            <FormField label="Description">
              <TextArea {...form.register("description")} placeholder="What does this milestone represent?" />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Due Date">
                <DatePicker value={form.watch("dueDate")} onChange={(d) => form.setValue("dueDate", d ?? undefined)} />
              </FormField>
              <FormField label="Status">
                <Select
                  value={form.watch("status")}
                  onValueChange={(v) => form.setValue("status", v)}
                  options={STATUS_OPTIONS}
                />
              </FormField>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => { setCreateOpen(false); setEditTarget(null); }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editTarget
                  ? (updateMutation.isPending ? "Saving…" : "Save changes")
                  : (createMutation.isPending ? "Creating…" : "Create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(undefined)}
        title="Delete milestone"
        description={`Delete "${deleteTarget?.title}"?`}
        variant="destructive"
        confirmLabel="Delete"
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(undefined) }); }}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
