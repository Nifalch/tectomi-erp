"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost, apiDelete } from "@/lib/api/client";
import { ListPageLayout } from "@/components/layouts/list-page-layout";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useCommunications } from "@/lib/api/hooks";
import { toast } from "@/lib/hooks/use-toast";
import { toArray } from "@/lib/utils";
import { createActionsColumn, type RowAction } from "@/components/ui/data-table-row-actions";
import type { ColumnDef } from "@tanstack/react-table";

interface CommunicationRow {
  id: string;
  subject: string;
  type: string;
  direction: string;
  content?: string;
  createdBy?: { firstName: string; lastName: string };
  createdAt: string;
}

const schema = z.object({
  type: z.string().min(1, "Type required"),
  subject: z.string().min(1, "Subject required"),
  content: z.string().optional(),
  direction: z.string().min(1, "Direction required"),
});
type FormValues = z.infer<typeof schema>;

const typeTone: Record<string, "neutral" | "positive" | "warning" | "info"> = {
  EMAIL: "info",
  CALL: "positive",
  MEETING: "warning",
  NOTE: "neutral",
};

const directionTone: Record<string, "neutral" | "positive" | "info"> = {
  INBOUND: "info",
  OUTBOUND: "positive",
};

export default function CommunicationsPage() {
  const query = useCommunications();
  const qc = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPost("/communications", data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["communications"] }); toast({ variant: "success", title: "Communication logged" }); },
    onError: () => toast({ variant: "error", title: "Failed to log communication" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/communications/${id}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["communications"] }); toast({ variant: "success", title: "Communication deleted" }); },
    onError: () => toast({ variant: "error", title: "Failed to delete communication" }),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CommunicationRow | undefined>();
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { type: "EMAIL", direction: "OUTBOUND" } });

  if (query.isLoading) return <LoadingState label="Loading communications..." />;
  if (query.isError || !query.data) return <ErrorState label="Unable to load communications." />;

  const communications = toArray<CommunicationRow>(query.data);

  const rowActions: RowAction<CommunicationRow>[] = [
    { label: "Delete", icon: <Trash2 className="size-4" />, onClick: (row) => setDeleteTarget(row), destructive: true },
  ];

  const columns: ColumnDef<CommunicationRow, unknown>[] = [
    { accessorKey: "subject", header: "Subject", cell: ({ row }) => <span className="font-medium">{row.original.subject}</span> },
    { accessorKey: "type", header: "Type", cell: ({ row }) => <Badge tone={typeTone[row.original.type] ?? "neutral"} size="sm">{row.original.type}</Badge> },
    { accessorKey: "direction", header: "Direction", cell: ({ row }) => <Badge tone={directionTone[row.original.direction] ?? "neutral"} size="sm">{row.original.direction}</Badge> },
    { id: "createdBy", header: "Created By", cell: ({ row }) => row.original.createdBy ? `${row.original.createdBy.firstName} ${row.original.createdBy.lastName}` : "---" },
    { accessorKey: "createdAt", header: "Date", cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString() },
    createActionsColumn(rowActions),
  ];

  const onSubmit = (values: FormValues) => {
    createMutation.mutate(values, { onSuccess: () => { setCreateOpen(false); form.reset({ type: "EMAIL", direction: "OUTBOUND" }); } });
  };

  return (
    <ListPageLayout
      module="clients"
      title="Communications"
      description="Log and track all client and team communications."
      primaryAction={{ label: "Log Communication", icon: <Plus className="mr-1 size-4" />, onClick: () => setCreateOpen(true) }}
      counts={[
        { label: "inbound", value: communications.filter((c) => c.direction === "INBOUND").length, tone: "info" },
        { label: "outbound", value: communications.filter((c) => c.direction === "OUTBOUND").length, tone: "positive" },
        { label: "total", value: communications.length },
      ]}
    >
      <DataTable columns={columns} data={communications} searchPlaceholder="Search communications..." emptyState={{ title: "No communications", description: "Log your first communication to start tracking." }} />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>Log Communication</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Type" required>
                <Select value={form.watch("type")} onValueChange={(v) => form.setValue("type", v)}
                  options={[{ value: "EMAIL", label: "Email" }, { value: "CALL", label: "Call" }, { value: "MEETING", label: "Meeting" }, { value: "NOTE", label: "Note" }]} />
              </FormField>
              <FormField label="Direction" required>
                <Select value={form.watch("direction")} onValueChange={(v) => form.setValue("direction", v)}
                  options={[{ value: "INBOUND", label: "Inbound" }, { value: "OUTBOUND", label: "Outbound" }]} />
              </FormField>
            </div>
            <FormField label="Subject" required error={form.formState.errors.subject?.message}>
              <Input {...form.register("subject")} error={!!form.formState.errors.subject} placeholder="Follow-up on proposal" />
            </FormField>
            <FormField label="Content">
              <TextArea {...form.register("content")} placeholder="Details of the communication..." className="min-h-[120px]" />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? "Saving..." : "Log Communication"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(undefined); }}
        title="Delete communication" description={`Delete "${deleteTarget?.subject}"? This cannot be undone.`} variant="destructive" confirmLabel="Delete"
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(undefined) }); }}
        loading={deleteMutation.isPending} />
    </ListPageLayout>
  );
}
