"use client";

import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { NumberInput } from "@/components/ui/number-input";
import { Button } from "@/components/ui/button";
import { useProjects } from "@/lib/api/hooks";
import { toArray } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost } from "@/lib/api/client";
import { toast } from "@/lib/hooks/use-toast";

const schema = z.object({
  projectId: z.string().min(1, "Project is required"),
  duration: z.number({ error: "Duration required" }).min(1),
  startTime: z.date({ error: "Date required" }),
  notes: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

interface Props { open: boolean; onOpenChange: (open: boolean) => void }

export function CreateTimeEntryDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const createMutation = useMutation({
    mutationFn: (data: { projectId: string; startTime: string; duration: number; notes?: string }) => apiPost("/time-entries", data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["time-entries"] }); toast({ variant: "success", title: "Time entry logged" }); },
    onError: () => toast({ variant: "error", title: "Failed to log time" }),
  });

  const projectsQuery = useProjects();
  const projects = toArray<{ id: string; name: string }>(projectsQuery.data);

  const form = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = (values: FormValues) => {
    createMutation.mutate(
      { projectId: values.projectId, startTime: values.startTime.toISOString(), duration: values.duration, notes: values.notes },
      { onSuccess: () => { onOpenChange(false); form.reset(); } },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Log Time Entry</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField label="Project" required error={form.formState.errors.projectId?.message}>
            <Select value={form.watch("projectId")} onValueChange={(v) => form.setValue("projectId", v)} placeholder="Select project"
              options={projects.map((p) => ({ value: p.id, label: p.name }))} error={!!form.formState.errors.projectId} />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Duration (minutes)" required error={form.formState.errors.duration?.message}>
              <NumberInput value={form.watch("duration")} onChange={(v) => form.setValue("duration", v ?? 0)} suffix="min" error={!!form.formState.errors.duration} />
            </FormField>
            <FormField label="Date" required error={form.formState.errors.startTime?.message}>
              <DatePicker value={form.watch("startTime")} onChange={(d) => form.setValue("startTime", d!)} error={!!form.formState.errors.startTime} />
            </FormField>
          </div>
          <FormField label="Notes"><Input {...form.register("notes")} placeholder="What did you work on?" /></FormField>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? "Logging..." : "Log Time"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
