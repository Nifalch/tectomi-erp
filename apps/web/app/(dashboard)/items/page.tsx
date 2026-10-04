"use client";

import { useState } from "react";
import { Plus, Trash2, Pencil } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ListPageLayout } from "@/components/layouts/list-page-layout";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { NumberInput } from "@/components/ui/number-input";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useItems, useTaxRates, useChartAccounts } from "@/lib/api/hooks";
import { useCreateItem, useUpdateItem, useDeleteItem } from "@/lib/api/mutations";
import { apiPatch } from "@/lib/api/client";
import { toast } from "@/lib/hooks/use-toast";
import { formatCurrency, toArray } from "@/lib/utils";
import { createActionsColumn, type RowAction } from "@/components/ui/data-table-row-actions";
import type { ColumnDef } from "@tanstack/react-table";

interface ItemRow {
  id: string;
  name: string;
  sku?: string;
  type: string;
  sellingPrice: number;
  purchasePrice?: number;
  unit?: string;
  description?: string;
  isActive: boolean;
  incomeAccountId?: string;
  expenseAccountId?: string;
  taxRateId?: string;
  taxRate?: { id: string; name: string; rate: number };
}

interface FormState {
  name: string;
  sku: string;
  type: "GOODS" | "SERVICE";
  sellingPrice: number;
  purchasePrice: number;
  unit: string;
  incomeAccountId: string;
  expenseAccountId: string;
  taxRateId: string;
  description: string;
  isActive: boolean;
}

const emptyForm: FormState = {
  name: "",
  sku: "",
  type: "SERVICE",
  sellingPrice: 0,
  purchasePrice: 0,
  unit: "pcs",
  incomeAccountId: "",
  expenseAccountId: "",
  taxRateId: "",
  description: "",
  isActive: true,
};

export default function ItemsPage() {
  const query = useItems();
  const taxQuery = useTaxRates();
  const accQuery = useChartAccounts();
  const createMutation = useCreateItem();
  const deleteMutation = useDeleteItem();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<ItemRow | undefined>();

  const updateMutation = useUpdateItem(editingId ?? "");
  const qc = useQueryClient();
  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => apiPatch(`/items/${id}`, { isActive }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["items"] }); toast({ variant: "success", title: "Item updated" }); },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to update item", description: e.message }),
  });

  if (query.isLoading) return <LoadingState label="Loading items..." />;
  if (query.isError || !query.data) return <ErrorState label="Unable to load items." />;

  const items = toArray<ItemRow>(query.data);
  const taxRates = toArray<{ id: string; name: string; rate: number }>(taxQuery.data);
  const accounts = toArray<{ id: string; name: string; type: string }>(accQuery.data);
  const incomeAccounts = accounts.filter((a) => a.type === "INCOME");
  const expenseAccounts = accounts.filter((a) => a.type === "EXPENSE");

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (row: ItemRow) => {
    setEditingId(row.id);
    setForm({
      name: row.name,
      sku: row.sku ?? "",
      type: (row.type as "GOODS" | "SERVICE") ?? "SERVICE",
      sellingPrice: Number(row.sellingPrice) || 0,
      purchasePrice: Number(row.purchasePrice) || 0,
      unit: row.unit ?? "pcs",
      incomeAccountId: row.incomeAccountId ?? "",
      expenseAccountId: row.expenseAccountId ?? "",
      taxRateId: row.taxRateId ?? "",
      description: row.description ?? "",
      isActive: row.isActive,
    });
    setDialogOpen(true);
  };

  const submit = () => {
    if (!form.name.trim()) return;
    const payload: Record<string, unknown> = {
      name: form.name,
      sku: form.sku || undefined,
      type: form.type,
      sellingPrice: form.sellingPrice,
      purchasePrice: form.purchasePrice,
      unit: form.unit,
      incomeAccountId: form.incomeAccountId || undefined,
      expenseAccountId: form.expenseAccountId || undefined,
      taxRateId: form.taxRateId || undefined,
      description: form.description || undefined,
      isActive: form.isActive,
    };
    const onDone = { onSuccess: () => setDialogOpen(false) };
    if (editingId) updateMutation.mutate(payload, onDone);
    else createMutation.mutate(payload, onDone);
  };

  const toggleActive = (row: ItemRow) => {
    toggleMutation.mutate({ id: row.id, isActive: !row.isActive });
  };

  const rowActions: RowAction<ItemRow>[] = [
    { label: "Edit", icon: <Pencil className="size-4" />, onClick: openEdit },
    { label: "Toggle Active", onClick: toggleActive },
    { label: "Delete", icon: <Trash2 className="size-4" />, onClick: (r) => setDeleteTarget(r), destructive: true, separator: true },
  ];

  const columns: ColumnDef<ItemRow, unknown>[] = [
    { accessorKey: "name", header: "Name", cell: ({ row }) => (
      <div>
        <div className="font-medium">{row.original.name}</div>
        {row.original.description && <div className="text-xs text-slate-500 line-clamp-1">{row.original.description}</div>}
      </div>
    )},
    { accessorKey: "sku", header: "SKU", cell: ({ row }) => row.original.sku ?? "—" },
    { accessorKey: "type", header: "Type", cell: ({ row }) => (
      <Badge tone={row.original.type === "GOODS" ? "info" : "neutral"} size="sm">{row.original.type}</Badge>
    )},
    { accessorKey: "sellingPrice", header: "Selling Price", cell: ({ row }) => formatCurrency(Number(row.original.sellingPrice) || 0) },
    { id: "tax", header: "Tax Rate", cell: ({ row }) => row.original.taxRate?.name ?? "—" },
    { accessorKey: "isActive", header: "Status", cell: ({ row }) => (
      <Badge tone={row.original.isActive ? "positive" : "neutral"} size="sm" dot>
        {row.original.isActive ? "Active" : "Inactive"}
      </Badge>
    )},
    createActionsColumn(rowActions),
  ];

  return (
    <ListPageLayout
      module="accounts"
      title="Items"
      description="Goods and services catalog with pricing and tax defaults."
      primaryAction={{ label: "New Item", icon: <Plus className="mr-1 size-4" />, onClick: openCreate }}
      counts={[
        { label: "active", value: items.filter((i) => i.isActive).length, tone: "positive" },
        { label: "total", value: items.length },
      ]}
    >
      <DataTable
        columns={columns}
        data={items}
        searchPlaceholder="Search items..."
        moduleColor="accounts"
        emptyState={{ title: "No items yet", description: "Create reusable items to speed up invoices." }}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>{editingId ? "Edit Item" : "New Item"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Name" required>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Consulting hour" />
              </FormField>
              <FormField label="SKU">
                <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="CONS-001" />
              </FormField>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <FormField label="Type">
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm({ ...form, type: v as "GOODS" | "SERVICE" })}
                  options={[{ value: "GOODS", label: "Goods" }, { value: "SERVICE", label: "Service" }]}
                />
              </FormField>
              <FormField label="Unit">
                <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="pcs / hrs" />
              </FormField>
              <FormField label="Tax Rate">
                <Select
                  value={form.taxRateId}
                  onValueChange={(v) => setForm({ ...form, taxRateId: v })}
                  placeholder="Select tax"
                  options={[{ value: "", label: "None" }, ...taxRates.map((t) => ({ value: t.id, label: `${t.name} (${t.rate}%)` }))]}
                />
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Selling Price">
                <NumberInput value={form.sellingPrice} onChange={(v) => setForm({ ...form, sellingPrice: v ?? 0 })} prefix="INR" />
              </FormField>
              <FormField label="Purchase Price">
                <NumberInput value={form.purchasePrice} onChange={(v) => setForm({ ...form, purchasePrice: v ?? 0 })} prefix="INR" />
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Income Account">
                <Select
                  value={form.incomeAccountId}
                  onValueChange={(v) => setForm({ ...form, incomeAccountId: v })}
                  placeholder="Select income account"
                  options={[{ value: "", label: "None" }, ...incomeAccounts.map((a) => ({ value: a.id, label: a.name }))]}
                />
              </FormField>
              <FormField label="Expense Account">
                <Select
                  value={form.expenseAccountId}
                  onValueChange={(v) => setForm({ ...form, expenseAccountId: v })}
                  placeholder="Select expense account"
                  options={[{ value: "", label: "None" }, ...expenseAccounts.map((a) => ({ value: a.id, label: a.name }))]}
                />
              </FormField>
            </div>
            <FormField label="Description">
              <TextArea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </FormField>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              Active
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button type="button" onClick={submit} disabled={createMutation.isPending || updateMutation.isPending}>
              {editingId ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) setDeleteTarget(undefined); }}
        title="Delete item"
        description={`Delete "${deleteTarget?.name}"?`}
        variant="destructive"
        confirmLabel="Delete"
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(undefined) }); }}
        loading={deleteMutation.isPending}
      />
    </ListPageLayout>
  );
}
