"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { NumberInput } from "@/components/ui/number-input";
import { Button } from "@/components/ui/button";
import { useCreateTask, useUpdateTask, useStartTimer } from "@/lib/api/mutations";
import { useProjects, useUsers, useSprints, useProjectMilestones, useProjectStatuses } from "@/lib/api/hooks";
import { toArray, staffOnly } from "@/lib/utils";
import { useAuthStore } from "@/lib/store/auth-store";
import { Timer, AlertCircle } from "lucide-react";

const schema = z.object({
  projectId: z.string().min(1, "Project is required"),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  assignedToId: z.string().optional(),
  status: z.string().optional(),
  customStatusId: z.string().optional(),
  priority: z.string().optional(),
  dueDate: z.date().optional(),
  startDate: z.date().optional(),
  sprintId: z.string().optional(),
  milestoneId: z.string().optional(),
  storyPoints: z.number().int().nonnegative().optional(),
  estimatedHrs: z.number().nonnegative().optional(),
});

type FormValues = z.infer<typeof schema>;

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultProjectId?: string;
  defaultStatus?: string;
  defaultDueDate?: string;
  editData?: {
    id: string;
    projectId: string;
    title: string;
    description?: string;
    assignedToId?: string;
    status?: string;
    priority?: string;
    dueDate?: string;
    startDate?: string;
    milestoneId?: string | null;
  };
}

// Lightweight internal field wrapper — tighter than the global FormField.
function Field({
  label,
  required,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label}
        {required && <span className="text-destructive">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-[11px] text-destructive">{error}</p>}
      {hint && !error && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
      {children}
    </div>
  );
}

export function CreateTaskDialog({ open, onOpenChange, defaultProjectId, defaultStatus, defaultDueDate, editData }: CreateTaskDialogProps) {
  const isEdit = !!editData;
  const createMutation = useCreateTask();
  const updateMutation = useUpdateTask(editData?.id ?? "");
  const startTimerMutation = useStartTimer();
  const projectsQuery = useProjects();
  const usersQuery = useUsers();
  const searchParams = useSearchParams();
  const viewUserId = searchParams?.get("userId") ?? undefined;
  const selfId = useAuthStore((s) => s.user?.id);
  const [startTimerOnCreate, setStartTimerOnCreate] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      projectId: defaultProjectId ?? "",
      title: "",
      description: "",
      status: defaultStatus ?? "TODO",
      priority: "MEDIUM",
    },
  });

  useEffect(() => {
    if (editData) {
      form.reset({
        projectId: editData.projectId,
        title: editData.title,
        description: editData.description ?? "",
        assignedToId: editData.assignedToId ?? undefined,
        status: editData.status ?? "TODO",
        priority: editData.priority ?? "MEDIUM",
        dueDate: editData.dueDate ? new Date(editData.dueDate) : undefined,
        startDate: editData.startDate ? new Date(editData.startDate) : undefined,
        milestoneId: editData.milestoneId ?? undefined,
      });
    } else {
      form.reset({
        projectId: defaultProjectId ?? "",
        title: "",
        description: "",
        status: defaultStatus ?? "TODO",
        priority: "MEDIUM",
        dueDate: defaultDueDate ? new Date(defaultDueDate) : undefined,
      });
    }
  }, [editData, defaultProjectId, defaultStatus, defaultDueDate, form]);

  const onSubmit = (values: FormValues) => {
    const resolvedAssignee =
      values.assignedToId && values.assignedToId.length > 0
        ? values.assignedToId
        : (viewUserId ?? selfId ?? undefined);

    const payload: any = {
      ...values,
      assignedToId: resolvedAssignee,
      dueDate: values.dueDate?.toISOString(),
      startDate: values.startDate?.toISOString(),
    };
    // When the project has custom statuses, send customStatusId (and drop the enum
    // status — server will derive it from the status category).
    if (hasCustomStatuses) {
      if (!values.customStatusId) {
        delete payload.customStatusId;
      }
      delete payload.status;
    } else {
      delete payload.customStatusId;
    }
    // Normalise empty milestoneId to undefined for create, empty-string to clear on edit
    if (!payload.milestoneId) {
      payload.milestoneId = isEdit ? "" : undefined;
    }
    if (isEdit) {
      updateMutation.mutate(payload, {
        onSuccess: () => {
          onOpenChange(false);
          form.reset();
        },
      });
    } else {
      createMutation.mutate(payload, {
        onSuccess: (data: any) => {
          onOpenChange(false);
          form.reset();
          if (startTimerOnCreate && data?.id) {
            startTimerMutation.mutate({ taskId: data.id });
          }
          setStartTimerOnCreate(false);
        },
      });
    }
  };

  const projects = (projectsQuery.data?.data ?? []) as Array<{ id: string; name: string }>;
  // Exclude CLIENT users — they can't be assigned tasks.
  const users = staffOnly(
    (usersQuery.data?.data ?? []) as Array<{
      id: string;
      firstName: string;
      lastName: string;
      roles?: Array<{ role?: { code?: string } } | string>;
    }>,
  );
  const selectedProjectId = form.watch("projectId");
  const sprintsQuery = useSprints(selectedProjectId || undefined);
  const sprints = toArray<{ id: string; name: string; status: string }>(sprintsQuery.data);
  const statusesQuery = useProjectStatuses(selectedProjectId || null);
  const customStatuses = toArray<{ id: string; name: string; color: string; sortOrder?: number }>(
    statusesQuery.data,
  ).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const hasCustomStatuses = customStatuses.length > 0;
  const milestonesQuery = useProjectMilestones(selectedProjectId || null);
  const milestones = (Array.isArray(milestonesQuery.data) ? milestonesQuery.data : []) as Array<{
    id: string;
    title: string;
    status?: string;
  }>;

  const submitError = (createMutation.error ?? updateMutation.error) as Error | null | undefined;
  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Task" : "Create a new task"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          {/* ────────── ESSENTIALS ────────── */}
          <div className="space-y-3">
            {/* Title — big hero input */}
            <div>
              <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Title <span className="text-destructive">*</span>
              </label>
              <Input
                {...form.register("title")}
                error={!!form.formState.errors.title}
                placeholder="What needs to be done?"
                className="!h-12 !text-base"
                autoFocus={!isEdit}
              />
              {form.formState.errors.title && (
                <p className="mt-1 text-[11px] text-destructive">{form.formState.errors.title.message}</p>
              )}
            </div>

            {/* Project + Assignee — side by side */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Project" required error={form.formState.errors.projectId?.message}>
                <Select
                  value={form.watch("projectId")}
                  onValueChange={(v) => form.setValue("projectId", v, { shouldValidate: true })}
                  error={!!form.formState.errors.projectId}
                  placeholder="Select project"
                  options={projects.map((p) => ({ value: p.id, label: p.name }))}
                  disabled={!!defaultProjectId}
                />
              </Field>

              <Field label="Assignee" hint={!form.watch("assignedToId") ? "Defaults to current user" : undefined}>
                <Select
                  value={form.watch("assignedToId") ?? ""}
                  onValueChange={(v) => form.setValue("assignedToId", v)}
                  placeholder="Auto-assign (me)"
                  options={[
                    { value: "", label: "Auto-assign (me)" },
                    ...users.map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName}` })),
                  ]}
                />
              </Field>
            </div>

            {/* Description */}
            <Field label="Description">
              <TextArea
                {...form.register("description")}
                placeholder="Add more context, acceptance criteria, links…"
                className="min-h-[96px]"
              />
            </Field>
          </div>

          {/* ────────── SCHEDULING ────────── */}
          <div className="rounded-xl border border-border/60 bg-slate-50/50 p-4 dark:bg-slate-900/30">
            <SectionHeader>Scheduling</SectionHeader>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Status">
                {hasCustomStatuses ? (
                  <Select
                    value={form.watch("customStatusId") ?? ""}
                    onValueChange={(v) => form.setValue("customStatusId", v)}
                    placeholder="Select status"
                    options={customStatuses.map((s) => ({ value: s.id, label: s.name }))}
                  />
                ) : (
                  <Select
                    value={form.watch("status")}
                    onValueChange={(v) => form.setValue("status", v)}
                    options={[
                      { value: "BACKLOG", label: "Backlog" },
                      { value: "TODO", label: "To Do" },
                      { value: "IN_PROGRESS", label: "In Progress" },
                      { value: "REVIEW", label: "Review" },
                      { value: "DONE", label: "Done" },
                      { value: "BLOCKED", label: "Blocked" },
                    ]}
                  />
                )}
              </Field>

              <Field label="Priority">
                <Select
                  value={form.watch("priority")}
                  onValueChange={(v) => form.setValue("priority", v)}
                  options={[
                    { value: "URGENT", label: "🔴 Urgent" },
                    { value: "HIGH", label: "🟠 High" },
                    { value: "MEDIUM", label: "🔵 Medium" },
                    { value: "LOW", label: "⚪ Low" },
                  ]}
                />
              </Field>

              <Field label="Sprint" className="col-span-2 sm:col-span-1">
                <Select
                  value={form.watch("sprintId") ?? ""}
                  onValueChange={(v) => form.setValue("sprintId", v)}
                  placeholder="Backlog"
                  options={[
                    { value: "", label: "Backlog" },
                    ...sprints.map((s) => ({
                      value: s.id,
                      label: s.status === "ACTIVE"
                        ? `${s.name} · Active`
                        : s.status === "COMPLETED"
                          ? `${s.name} · Done`
                          : s.name,
                    })),
                  ]}
                />
              </Field>

              <Field label="Start Date" className="col-span-2 sm:col-span-1">
                <DatePicker
                  value={form.watch("startDate")}
                  onChange={(d) => form.setValue("startDate", d ?? undefined)}
                />
              </Field>

              <Field label="Due Date" className="col-span-2 sm:col-span-1">
                <DatePicker
                  value={form.watch("dueDate")}
                  onChange={(d) => form.setValue("dueDate", d ?? undefined)}
                  minDate={form.watch("startDate")}
                />
              </Field>
            </div>

            {selectedProjectId && milestones.length > 0 && (
              <div className="mt-3">
                <Field label="Milestone">
                  <Select
                    value={form.watch("milestoneId") ?? ""}
                    onValueChange={(v) => form.setValue("milestoneId", v)}
                    placeholder="No milestone"
                    options={[
                      { value: "", label: "No milestone" },
                      ...milestones.map((m) => ({
                        value: m.id,
                        label: m.status && m.status !== "NOT_STARTED"
                          ? `${m.title} · ${m.status}`
                          : m.title,
                      })),
                    ]}
                  />
                </Field>
              </div>
            )}
          </div>

          {/* ────────── EFFORT ────────── */}
          <div className="rounded-xl border border-border/60 bg-slate-50/50 p-4 dark:bg-slate-900/30">
            <SectionHeader>Estimation</SectionHeader>

            <div className="grid grid-cols-2 gap-3 sm:max-w-xs">
              <Field label="Story points" hint="Relative complexity">
                <NumberInput
                  value={form.watch("storyPoints") ?? null}
                  onChange={(v) => form.setValue("storyPoints", v ?? undefined)}
                  placeholder="0"
                />
              </Field>

              <Field label="Est. hours" hint="Time budget">
                <NumberInput
                  value={form.watch("estimatedHrs") ?? null}
                  onChange={(v) => form.setValue("estimatedHrs", v ?? undefined)}
                  suffix="h"
                  placeholder="0"
                />
              </Field>
            </div>
          </div>

          {/* Start timer toggle — only on create */}
          {!isEdit && (
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-border/60 bg-primary/[0.04] p-3 text-sm text-slate-700 transition-colors hover:border-primary/40 dark:text-slate-300">
              <input
                type="checkbox"
                checked={startTimerOnCreate}
                onChange={(e) => setStartTimerOnCreate(e.target.checked)}
                className="mt-0.5 size-4 rounded border-slate-300 text-primary focus:ring-primary"
              />
              <div className="flex-1">
                <div className="flex items-center gap-1.5 font-medium">
                  <Timer className="size-3.5 text-primary" />
                  Start timer immediately
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  Kick off time tracking on this task as soon as it's created.
                </div>
              </div>
            </label>
          )}

          {/* Error banner */}
          {submitError && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{submitError.message || "Something went wrong. Please try again."}</span>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : isEdit ? "Save changes" : "Create task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
