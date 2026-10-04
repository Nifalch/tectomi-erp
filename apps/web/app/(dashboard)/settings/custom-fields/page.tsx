"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { ListPageLayout } from "@/components/layouts/list-page-layout";
import { DataTable } from "@/components/ui/data-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/number-input";
import { Badge } from "@/components/ui/badge";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useCustomFields } from "@/lib/api/hooks";
import { useCreateCustomField, useUpdateCustomField, useDeleteCustomField } from "@/lib/api/mutations";
import { createActionsColumn, type RowAction } from "@/components/ui/data-table-row-actions";
import type { ColumnDef } from "@tanstack/react-table";

interface CustomFieldRow {
  id: string;
  entity: string;
  key: string;
  label: string;
  type: "TEXT" | "TEXTAREA" | "NUMBER" | "DATE" | "BOOLEAN" | "SELECT" | "MULTI_SELECT" | "URL";
  options?: string[] | null;
  required?: boolean;
  sortOrder?: number;
}

const TYPE_OPTIONS = [
  { value: "TEXT", label: "Text" },
  { value: "TEXTAREA", label: "Text area" },
  { value: "NUMBER", label: "Number" },
  { value: "DATE", label: "Date" },
  { value: "BOOLEAN", label: "Boolean" },
  { value: "SELECT", label: "Select (one)" },
  { value: "MULTI_SELECT", label: "Multi-select" },
  { value: "URL", label: "URL" },
];

const ENTITY_OPTIONS = [
  { value: "client", label: "Clients" },
  { value: "project", label: "Projects" },
  { value: "task", label: "Tasks" },
];

function toSnakeCase(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

export default function CustomFieldsSettingsPage() {
  const [entity, setEntity] = useState<string>("client");
  const query = useCustomFields(entity);
  const createMut = useCreateCustomField();
  const [editing, setEditing] = useState<CustomFieldRow | undefined>();
  const updateMut = useUpdateCustomField(editing?.id ?? "");
  const deleteMut = useDeleteCustomField();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CustomFieldRow | undefined>();

  const [form, setForm] = useState({
    label: "",
    key: "",
    type: "TEXT",
    options: "",
    required: false,
    sortOrder: 0,
    keyTouched: false,
  });

  useEffect(() => {
    if (editing) {
      setForm({
        label: editing.label,
        key: editing.key,
        type: editing.type,
        options: (editing.options ?? []).join(", "),
        required: !!editing.required,
        sortOrder: editing.sortOrder ?? 0,
        keyTouched: true,
      });
    } else {
      setForm({ label: "", key: "", type: "TEXT", options: "", required: false, sortOrder: 0, keyTouched: false });
    }
  }, [editing]);

  const rows = useMemo<CustomFieldRow[]>(
    () => (Array.isArray(query.data) ? (query.data as unknown as CustomFieldRow[]) : []),
    [query.data],
  );

  const needsOptions = form.type === "SELECT" || form.type === "MULTI_SELECT";

  const onSubmit = () => {
    const options = needsOptions
      ? form.options.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;
    const payload = {
      entity,
      key: form.key || toSnakeCase(form.label),
      label: form.label,
      type: form.type,
      options,
      required: form.required,
      sortOrder: form.sortOrder,
    };
    if (editing) {
      updateMut.mutate(
        { label: payload.label, type: payload.type, options, required: payload.required, sortOrder: payload.sortOrder },
        { onSuccess: () => { setDialogOpen(false); setEditing(undefined); } },
      );
    } else {
      createMut.mutate(payload, { onSuccess: () => { setDialogOpen(false); } });
    }
  };

  const rowActions: RowAction<CustomFieldRow>[] = [
    { label: "Edit", icon: <Pencil className="size-4" />, onClick: (r) => { setEditing(r); setDialogOpen(true); } },
    { label: "Delete", icon: <Trash2 className="size-4" />, onClick: (r) => setDeleteTarget(r), destructive: true, separator: true },
  ];

  const columns: ColumnDef<CustomFieldRow, unknown>[] = [
    { accessorKey: "label", header: "Label", cell: ({ row }) => <span className="font-medium">{row.original.label}</span> },
    { accessorKey: "key", header: "Key", cell: ({ row }) => <code className="text-xs text-slate-500">{row.original.key}</code> },
    { accessorKey: "type", header: "Type", cell: ({ row }) => <Badge tone="neutral" size="sm">{row.original.type}</Badge> },
    { accessorKey: "required", header: "Required", cell: ({ row }) => row.original.required ? <Badge tone="info" size="sm">Required</Badge> : <span className="text-slate-400">—</span> },
    { accessorKey: "sortOrder", header: "Sort", cell: ({ row }) => <span className="text-xs text-slate-500">{row.original.sortOrder ?? 0}</span> },
    createActionsColumn(rowActions),
  ];

  if (query.isLoading) return <LoadingState label="Loading custom fields..." />;
  if (query.isError) return <ErrorState label="Unable to load custom fields." />;

  return (
    <ListPageLayout
      module="settings"
      title="Custom Fields"
      description="Define extra fields captured on clients, projects, and tasks."
      breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Custom Fields" }]}
      primaryAction={{
        label: "Add field",
        icon: <Plus className="mr-1 size-4" />,
        onClick: () => { setEditing(undefined); setDialogOpen(true); },
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-slate-500">Module:</span>
        <div className="min-w-[200px]">
          <Select value={entity} onValueChange={setEntity} options={ENTITY_OPTIONS} />
        </div>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        searchPlaceholder="Search fields..."
        moduleColor="settings"
        emptyState={{ title: "No custom fields", description: "Add your first custom field to this module." }}
      />

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditing(undefined); }}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>{editing ? "Edit custom field" : "New custom field"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <FormField label="Label" required>
              <Input
                value={form.label}
                onChange={(e) => {
                  const label = e.target.value;
                  setForm((f) => ({
                    ...f,
                    label,
                    key: f.keyTouched ? f.key : toSnakeCase(label),
                  }));
                }}
                placeholder="e.g. Contract ID"
              />
            </FormField>
            <FormField label="Key" description="Unique, snake_case identifier. Cannot be changed after creation.">
              <Input
                value={form.key}
                disabled={!!editing}
                onChange={(e) => setForm((f) => ({ ...f, key: toSnakeCase(e.target.value), keyTouched: true }))}
                placeholder="contract_id"
              />
            </FormField>
            <FormField label="Type" required>
              <Select
                value={form.type}
                onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}
                options={TYPE_OPTIONS}
              />
            </FormField>
            {needsOptions && (
              <FormField label="Options" description="Comma-separated list of allowed values." required>
                <Input
                  value={form.options}
                  onChange={(e) => setForm((f) => ({ ...f, options: e.target.value }))}
                  placeholder="Option A, Option B, Option C"
                />
              </FormField>
            )}
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Sort order">
                <NumberInput value={form.sortOrder} onChange={(v) => setForm((f) => ({ ...f, sortOrder: v ?? 0 }))} />
              </FormField>
              <FormField label=" ">
                <label className="inline-flex h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.required}
                    onChange={(e) => setForm((f) => ({ ...f, required: e.target.checked }))}
                    className="size-4"
                  />
                  Required
                </label>
              </FormField>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              type="button"
              onClick={onSubmit}
              disabled={
                createMut.isPending || updateMut.isPending ||
                !form.label.trim() ||
                (needsOptions && form.options.split(",").map((s) => s.trim()).filter(Boolean).length === 0)
              }
            >
              {(createMut.isPending || updateMut.isPending) ? "Saving…" : editing ? "Update field" : "Create field"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(undefined); }}
        title="Delete custom field?"
        description={`Delete "${deleteTarget?.label}"? Existing values stored on records will remain but be unlabelled.`}
        variant="destructive"
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteTarget) deleteMut.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(undefined) });
        }}
        loading={deleteMut.isPending}
      />
    </ListPageLayout>
  );
}
