"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Database } from "lucide-react";
import { ListPageLayout } from "@/components/layouts/list-page-layout";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { NumberInput } from "@/components/ui/number-input";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useTaxRates } from "@/lib/api/hooks";
import { useCreateTaxRate, useUpdateTaxRate, useDeleteTaxRate, useSeedDefaultTaxRates } from "@/lib/api/mutations";
import { toArray } from "@/lib/utils";
import { createActionsColumn, type RowAction } from "@/components/ui/data-table-row-actions";
import type { ColumnDef } from "@tanstack/react-table";

interface TaxRow {
  id: string;
  name: string;
  rate: number;
  type: string;
  isCompound?: boolean;
  isActive: boolean;
}

interface FormState { name: string; rate: number; type: string; isCompound: boolean; isActive: boolean }
const empty: FormState = { name: "", rate: 0, type: "GST", isCompound: false, isActive: true };

export default function TaxRatesPage() {
  const query = useTaxRates();
  const createMutation = useCreateTaxRate();
  const deleteMutation = useDeleteTaxRate();
  const seedMutation = useSeedDefaultTaxRates();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const updateMutation = useUpdateTaxRate(editingId ?? "");

  if (query.isLoading) return <LoadingState label="Loading tax rates..." />;
  if (query.isError) return <ErrorState label="Unable to load tax rates." />;

  const rows = toArray<TaxRow>(query.data);

  const openCreate = () => { setEditingId(null); setForm(empty); setOpen(true); };
  const openEdit = (r: TaxRow) => {
    setEditingId(r.id);
    setForm({ name: r.name, rate: Number(r.rate) || 0, type: r.type, isCompound: !!r.isCompound, isActive: r.isActive });
    setOpen(true);
  };

  const submit = () => {
    const payload = { name: form.name, rate: form.rate, type: form.type, isCompound: form.isCompound, isActive: form.isActive };
    const onDone = { onSuccess: () => setOpen(false) };
    if (editingId) updateMutation.mutate(payload, onDone);
    else createMutation.mutate(payload, onDone);
  };

  const rowActions: RowAction<TaxRow>[] = [
    { label: "Edit", icon: <Pencil className="size-4" />, onClick: openEdit },
    { label: "Delete", icon: <Trash2 className="size-4" />, onClick: (r) => { if (confirm(`Delete ${r.name}?`)) deleteMutation.mutate(r.id); }, destructive: true, separator: true },
  ];

  const columns: ColumnDef<TaxRow, unknown>[] = [
    { accessorKey: "name", header: "Name", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { accessorKey: "rate", header: "Rate %", cell: ({ row }) => `${row.original.rate}%` },
    { accessorKey: "type", header: "Type", cell: ({ row }) => <Badge tone="info" size="sm">{row.original.type}</Badge> },
    { id: "compound", header: "Compound", cell: ({ row }) => row.original.isCompound ? "Yes" : "No" },
    { accessorKey: "isActive", header: "Active", cell: ({ row }) => (
      <Badge tone={row.original.isActive ? "positive" : "neutral"} size="sm" dot>{row.original.isActive ? "Active" : "Inactive"}</Badge>
    )},
    createActionsColumn(rowActions),
  ];

  return (
    <ListPageLayout module="accounts" title="Tax Rates" description="GST/VAT rates used on invoices and bills."
      primaryAction={{ label: "New Tax Rate", icon: <Plus className="mr-1 size-4" />, onClick: openCreate }}>
      <div className="mb-4 flex justify-end">
        <Button variant="secondary" size="sm" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
          <Database className="mr-1 size-4" /> Seed GST defaults
        </Button>
      </div>

      <DataTable columns={columns} data={rows} searchPlaceholder="Search tax rates..." moduleColor="accounts"
        emptyState={{ title: "No tax rates", description: "Seed defaults or add a new one." }} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>{editingId ? "Edit Tax Rate" : "New Tax Rate"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <FormField label="Name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="GST 18%" /></FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Rate %" required><NumberInput value={form.rate} onChange={(v) => setForm({ ...form, rate: v ?? 0 })} suffix="%" /></FormField>
              <FormField label="Type"><Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })} options={[{ value: "GST", label: "GST" }, { value: "VAT", label: "VAT" }]} /></FormField>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isCompound} onChange={(e) => setForm({ ...form, isCompound: e.target.checked })} /> Compound tax</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active</label>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit}>{editingId ? "Save" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListPageLayout>
  );
}
