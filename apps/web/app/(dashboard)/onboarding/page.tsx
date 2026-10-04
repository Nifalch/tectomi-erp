"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, CheckSquare } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost, apiPatch, apiDelete } from "@/lib/api/client";
import { ModuleHeader } from "@/components/layout/module-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useOnboardingChecklists } from "@/lib/api/hooks";
import { toast } from "@/lib/hooks/use-toast";
import { toArray } from "@/lib/utils";

interface ChecklistItem {
  id?: string;
  title: string;
  completed: boolean;
}

interface Checklist {
  id: string;
  title: string;
  items: ChecklistItem[];
}

const schema = z.object({
  title: z.string().min(1, "Title required"),
  items: z.string().min(1, "At least one item required"),
});
type FormValues = z.infer<typeof schema>;

export default function OnboardingPage() {
  const query = useOnboardingChecklists();
  const qc = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPost("/onboarding", data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["onboarding"] }); toast({ variant: "success", title: "Checklist created" }); },
    onError: () => toast({ variant: "error", title: "Failed to create checklist" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/onboarding/${id}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["onboarding"] }); toast({ variant: "success", title: "Checklist deleted" }); },
    onError: () => toast({ variant: "error", title: "Failed to delete checklist" }),
  });

  const toggleItemMutation = useMutation({
    mutationFn: ({ checklistId, itemId, completed }: { checklistId: string; itemId: string; completed: boolean }) =>
      apiPatch(`/onboarding/${checklistId}/items/${itemId}`, { completed }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["onboarding"] }); },
    onError: () => toast({ variant: "error", title: "Failed to update item" }),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Checklist | undefined>();
  const form = useForm<FormValues>({ resolver: zodResolver(schema) });

  if (query.isLoading) return <LoadingState label="Loading checklists..." />;
  if (query.isError || !query.data) return <ErrorState label="Unable to load checklists." />;

  const checklists = toArray<Checklist>(query.data);

  const onSubmit = (values: FormValues) => {
    const items = values.items
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((title) => ({ title }));

    createMutation.mutate(
      { title: values.title, items },
      { onSuccess: () => { setCreateOpen(false); form.reset(); } },
    );
  };

  return (
    <div className="flex flex-col gap-8">
      <ModuleHeader module="hr" title="Onboarding Checklists" description="Manage onboarding checklists for new employees."
        primaryAction={{ label: "New Checklist", icon: <Plus className="mr-1 size-4" />, onClick: () => setCreateOpen(true) }}
        counts={[{ label: "checklists", value: checklists.length }]}
      />

      {checklists.length === 0 ? (
        <Card><div className="py-12 text-center text-sm text-slate-400">No checklists yet. Create your first onboarding checklist.</div></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {checklists.map((checklist) => (
            <Card key={checklist.id} className="group relative transition hover:shadow-md">
              <div className="flex items-center gap-2">
                <CheckSquare className="size-4 text-slate-400" />
                <CardTitle className="text-base">{checklist.title}</CardTitle>
              </div>
              <ul className="mt-3 space-y-1.5">
                {toArray<ChecklistItem>(checklist.items).map((item, idx) => (
                  <li key={item.id ?? idx} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={item.completed}
                      disabled={!item.id || toggleItemMutation.isPending}
                      onChange={(e) => {
                        if (!item.id) return;
                        toggleItemMutation.mutate({ checklistId: checklist.id, itemId: item.id, completed: e.target.checked });
                      }}
                      className="size-3.5 rounded border-slate-300 cursor-pointer"
                    />
                    <span className={item.completed ? "line-through text-slate-400" : "text-slate-700 dark:text-slate-300"}>{item.title}</span>
                  </li>
                ))}
              </ul>
              <Button variant="ghost" size="sm" className="absolute right-2 top-2 hidden text-red-500 group-hover:flex" onClick={() => setDeleteTarget(checklist)}>
                <Trash2 className="size-3.5" />
              </Button>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>New Checklist</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField label="Title" required error={form.formState.errors.title?.message}>
              <Input {...form.register("title")} error={!!form.formState.errors.title} placeholder="New Employee Onboarding" />
            </FormField>
            <FormField label="Items (comma-separated)" required error={form.formState.errors.items?.message}>
              <Input {...form.register("items")} error={!!form.formState.errors.items} placeholder="Setup laptop, Create accounts, Office tour" />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? "Creating..." : "Create Checklist"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(undefined); }}
        title="Delete checklist" description={`Delete "${deleteTarget?.title}"? This cannot be undone.`} variant="destructive" confirmLabel="Delete"
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(undefined) }); }}
        loading={deleteMutation.isPending} />
    </div>
  );
}
