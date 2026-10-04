"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { ListPageLayout } from "@/components/layouts/list-page-layout";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useHolidays } from "@/lib/api/hooks";
import { useCreateHoliday, useDeleteHoliday } from "@/lib/api/mutations";
import { toArray } from "@/lib/utils";
import { createActionsColumn, type RowAction } from "@/components/ui/data-table-row-actions";
import type { ColumnDef } from "@tanstack/react-table";

interface HolidayRow { id: string; name: string; date: string; type: string; description?: string }

const schema = z.object({
  name: z.string().min(1, "Name required"),
  date: z.date({ error: "Date required" }),
  type: z.string().optional(),
  description: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export default function HolidaysPage() {
  const query = useHolidays();
  const createMutation = useCreateHoliday();
  const deleteMutation = useDeleteHoliday();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HolidayRow | undefined>();
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { type: "PUBLIC" } });

  if (query.isLoading) return <LoadingState label="Loading holidays..." />;
  if (query.isError || !query.data) return <ErrorState label="Unable to load holidays." />;

  const holidays = toArray<HolidayRow>(query.data);

  const rowActions: RowAction<HolidayRow>[] = [
    { label: "Delete", icon: <Trash2 className="size-4" />, onClick: (row) => setDeleteTarget(row), destructive: true },
  ];

  const columns: ColumnDef<HolidayRow, unknown>[] = [
    { accessorKey: "name", header: "Holiday", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { accessorKey: "date", header: "Date", cell: ({ row }) => new Date(row.original.date).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" }) },
    { accessorKey: "type", header: "Type", cell: ({ row }) => <Badge tone="neutral" size="sm">{row.original.type}</Badge> },
    { id: "description", header: "Description", cell: ({ row }) => <span className="text-xs text-slate-500">{row.original.description ?? "—"}</span> },
    createActionsColumn(rowActions),
  ];

  const onSubmit = (values: FormValues) => {
    createMutation.mutate({ ...values, date: values.date.toISOString() }, { onSuccess: () => { setCreateOpen(false); form.reset({ type: "PUBLIC" }); } });
  };

  return (
    <ListPageLayout module="attendance" title="Holiday Calendar" description="Company holidays and scheduled day-offs."
      primaryAction={{ label: "Add Holiday", icon: <Plus className="mr-1 size-4" />, onClick: () => setCreateOpen(true), permission: "hr:create" }}
      counts={[{ label: "holidays", value: holidays.length }]}
    >
      <DataTable columns={columns} data={holidays} searchPlaceholder="Search holidays..."
        emptyState={{ title: "No holidays", description: "Add company holidays to the calendar." }} />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Add Holiday</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField label="Holiday Name" required error={form.formState.errors.name?.message}>
              <Input {...form.register("name")} error={!!form.formState.errors.name} placeholder="Diwali" />
            </FormField>
            <FormField label="Date" required error={form.formState.errors.date?.message}>
              <DatePicker value={form.watch("date")} onChange={(d) => form.setValue("date", d!)} />
            </FormField>
            <FormField label="Type">
              <Select value={form.watch("type")} onValueChange={(v) => form.setValue("type", v)}
                options={[{ value: "PUBLIC", label: "Public Holiday" }, { value: "COMPANY", label: "Company Holiday" }, { value: "OPTIONAL", label: "Optional" }]} />
            </FormField>
            <FormField label="Description"><Input {...form.register("description")} placeholder="Optional description" /></FormField>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? "Adding..." : "Add Holiday"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(undefined); }}
        title="Delete holiday" description={`Remove "${deleteTarget?.name}"?`} variant="destructive" confirmLabel="Delete"
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(undefined) }); }}
        loading={deleteMutation.isPending} />
    </ListPageLayout>
  );
}
