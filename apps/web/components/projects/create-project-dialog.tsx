"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { NumberInput } from "@/components/ui/number-input";
import { Button } from "@/components/ui/button";
import { useCreateProject, useUpdateProject } from "@/lib/api/mutations";
import { useClients, useUsers } from "@/lib/api/hooks";
import { staffOnly } from "@/lib/utils";

const schema = z.object({
  name: z.string().min(1, "Project name is required"),
  clientId: z.string().min(1, "Client is required"),
  description: z.string().optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  budget: z.number().optional(),
  status: z.string().optional(),
  managerId: z.string().optional(),
  memberIds: z.array(z.string()).optional(),
});

type FormValues = z.infer<typeof schema>;

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editData?: {
    id: string;
    name: string;
    clientId?: string;
    description?: string;
    startDate?: string;
    endDate?: string;
    budget?: number;
    status?: string;
    managerId?: string;
    members?: Array<{ userId: string }>;
  };
}

export function CreateProjectDialog({ open, onOpenChange, editData }: CreateProjectDialogProps) {
  const isEdit = !!editData;
  const createMutation = useCreateProject();
  const updateMutation = useUpdateProject(editData?.id ?? "");
  const clientsQuery = useClients();
  const usersQuery = useUsers();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      clientId: "",
      description: "",
      status: "PLANNING",
    },
  });

  useEffect(() => {
    if (editData) {
      form.reset({
        name: editData.name,
        clientId: editData.clientId,
        description: editData.description ?? "",
        startDate: editData.startDate ? new Date(editData.startDate) : undefined,
        endDate: editData.endDate ? new Date(editData.endDate) : undefined,
        budget: editData.budget ?? undefined,
        status: editData.status ?? "PLANNING",
        managerId: editData.managerId ?? undefined,
        memberIds: editData.members?.map((m) => m.userId) ?? [],
      });
    } else {
      form.reset({ name: "", clientId: "", description: "", status: "PLANNING", memberIds: [] });
    }
  }, [editData, form]);

  const selectedMemberIds = form.watch("memberIds") ?? [];
  const toggleMember = (userId: string) => {
    const set = new Set(selectedMemberIds);
    if (set.has(userId)) set.delete(userId);
    else set.add(userId);
    form.setValue("memberIds", [...set]);
  };

  const onSubmit = (values: FormValues) => {
    const payload = {
      ...values,
      startDate: values.startDate?.toISOString(),
      endDate: values.endDate?.toISOString(),
    };

    const mutation = isEdit ? updateMutation : createMutation;
    mutation.mutate(payload, {
      onSuccess: () => {
        onOpenChange(false);
        form.reset();
      },
    });
  };

  const clients = (clientsQuery.data?.data ?? []) as Array<{ id: string; companyName: string }>;
  // Exclude CLIENT users from both the Project Manager picker and the Team
  // members checklist — clients aren't internal staff and can't run or
  // work a project.
  const users = staffOnly(
    (usersQuery.data?.data ?? []) as Array<{
      id: string;
      firstName: string;
      lastName: string;
      roles?: Array<{ role?: { code?: string } } | string>;
    }>,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Project" : "New Project"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Project Name" name="name" required error={form.formState.errors.name?.message}>
              <Input {...form.register("name")} error={!!form.formState.errors.name} placeholder="e.g. Website Redesign" />
            </FormField>

            <FormField label="Client" name="clientId" required error={form.formState.errors.clientId?.message}>
              <Select
                value={form.watch("clientId")}
                onValueChange={(v) => form.setValue("clientId", v)}
                error={!!form.formState.errors.clientId}
                placeholder="Select client"
                options={clients.map((c) => ({ value: c.id, label: c.companyName }))}
              />
            </FormField>
          </div>

          <FormField label="Description" name="description">
            <TextArea {...form.register("description")} placeholder="Brief project description..." />
          </FormField>

          <div className="grid grid-cols-3 gap-4">
            <FormField label="Start Date" name="startDate">
              <DatePicker
                value={form.watch("startDate")}
                onChange={(d) => form.setValue("startDate", d ?? undefined)}
              />
            </FormField>

            <FormField label="End Date" name="endDate">
              <DatePicker
                value={form.watch("endDate")}
                onChange={(d) => form.setValue("endDate", d ?? undefined)}
                minDate={form.watch("startDate") ?? undefined}
              />
            </FormField>

            <FormField label="Budget" name="budget">
              <NumberInput
                value={form.watch("budget")}
                onChange={(v) => form.setValue("budget", v ?? undefined)}
                prefix="INR"
                placeholder="0"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Status" name="status">
              <Select
                value={form.watch("status")}
                onValueChange={(v) => form.setValue("status", v)}
                options={[
                  { value: "PLANNING", label: "Planning" },
                  { value: "ACTIVE", label: "Active" },
                  { value: "ON_HOLD", label: "On Hold" },
                  { value: "COMPLETED", label: "Completed" },
                  { value: "CANCELLED", label: "Cancelled" },
                ]}
              />
            </FormField>

            <FormField label="Project Manager" name="managerId">
              <Select
                value={form.watch("managerId")}
                onValueChange={(v) => form.setValue("managerId", v)}
                placeholder="Select manager"
                options={users.map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName}` }))}
              />
            </FormField>
          </div>

          <FormField label={`Team members (${selectedMemberIds.length} selected)`} name="memberIds">
            <div className="max-h-48 overflow-y-auto rounded-xl border border-border/60 bg-white/50 p-2 dark:bg-slate-950/40">
              {users.length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-400">No users available.</p>
              ) : (
                <div className="grid grid-cols-2 gap-1">
                  {users.map((u) => {
                    const checked = selectedMemberIds.includes(u.id);
                    return (
                      <label
                        key={u.id}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition ${
                          checked
                            ? "bg-primary/10 text-primary"
                            : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleMember(u.id)}
                          className="size-4 rounded border-slate-300 text-primary focus:ring-primary"
                        />
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                          {u.firstName[0]}
                          {u.lastName[0]}
                        </span>
                        <span className="truncate">
                          {u.firstName} {u.lastName}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Only the members you add can see this project as a Space and work on its tasks.
            </p>
          </FormField>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : isEdit ? "Update" : "Create Project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
