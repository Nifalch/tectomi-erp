"use client";

import { useState } from "react";
import { Plus, Trash2, UserPlus, UserMinus } from "lucide-react";
import { ListPageLayout } from "@/components/layouts/list-page-layout";
import { DataTable } from "@/components/ui/data-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { NumberInput } from "@/components/ui/number-input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { createActionsColumn, type RowAction } from "@/components/ui/data-table-row-actions";
import { useAssets, useUsers } from "@/lib/api/hooks";
import { useCreateAsset, useUpdateAsset, useDeleteAsset, useAssignAsset } from "@/lib/api/mutations";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost } from "@/lib/api/client";
import { toast } from "@/lib/hooks/use-toast";
import { formatCurrency, toArray } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";

interface Asset {
  id: string;
  name: string;
  category?: string;
  serialNumber?: string;
  status: string;
  purchasePrice?: number;
  assignedTo?: { id?: string; firstName?: string; lastName?: string };
}

interface UserRow {
  id: string;
  firstName: string;
  lastName: string;
}

const STATUS_TONE: Record<string, "positive" | "info" | "warning" | "neutral" | "destructive"> = {
  AVAILABLE: "positive",
  ASSIGNED: "info",
  UNDER_REPAIR: "warning",
  RETIRED: "neutral",
  LOST: "destructive",
};

export default function AssetsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Asset | null>(null);
  const [assignTarget, setAssignTarget] = useState<Asset | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null);

  const assetsQuery = useAssets();
  const usersQuery = useUsers();

  const createAsset = useCreateAsset();
  const updateAsset = useUpdateAsset(editTarget?.id ?? "");
  const deleteAsset = useDeleteAsset();
  const assignAsset = useAssignAsset(assignTarget?.id ?? "");
  const qc = useQueryClient();
  const unassignMutation = useMutation({
    mutationFn: (id: string) => apiPost(`/assets/${id}/unassign`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["assets"] });
      toast({ variant: "success", title: "Asset unassigned" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to unassign", description: e.message }),
  });

  const assets = toArray<Asset>(assetsQuery.data);
  const users = toArray<UserRow>(usersQuery.data);

  const rowActions: RowAction<Asset>[] = [
    { label: "Assign", icon: <UserPlus className="size-4" />, onClick: (row) => setAssignTarget(row) },
    { label: "Unassign", icon: <UserMinus className="size-4" />, onClick: (row) => unassignMutation.mutate(row.id) },
    { label: "Edit", onClick: (row) => setEditTarget(row), separator: true },
    { label: "Delete", icon: <Trash2 className="size-4" />, onClick: (row) => setDeleteTarget(row), destructive: true },
  ];

  const columns: ColumnDef<Asset, unknown>[] = [
    { accessorKey: "name", header: "Asset" },
    { accessorKey: "category", header: "Category", cell: ({ row }) => row.original.category ?? "—" },
    { accessorKey: "serialNumber", header: "Serial #", cell: ({ row }) => row.original.serialNumber ?? "—" },
    {
      accessorKey: "assignedTo", header: "Assigned To",
      cell: ({ row }) => row.original.assignedTo ? `${row.original.assignedTo.firstName ?? ""} ${row.original.assignedTo.lastName ?? ""}`.trim() : "—",
    },
    {
      accessorKey: "status", header: "Status",
      cell: ({ row }) => (
        <Badge tone={STATUS_TONE[row.original.status] ?? "neutral"} dot size="sm">
          {row.original.status.replace(/_/g, " ")}
        </Badge>
      ),
      filterFn: "equals",
    },
    {
      accessorKey: "purchasePrice", header: "Price",
      cell: ({ row }) => row.original.purchasePrice ? formatCurrency(Number(row.original.purchasePrice)) : "—",
    },
    createActionsColumn(rowActions),
  ];

  if (assetsQuery.isLoading) return <LoadingState label="Loading assets..." />;
  if (assetsQuery.isError) return <ErrorState label="Unable to load assets." />;

  return (
    <ListPageLayout
      module="hr"
      title="Assets"
      description="Company assets and assignments."
      primaryAction={{ label: "New Asset", icon: <Plus className="mr-1 size-4" />, onClick: () => setCreateOpen(true) }}
      counts={[
        { label: "total", value: assets.length },
        { label: "available", value: assets.filter((a) => a.status === "AVAILABLE").length, tone: "positive" },
      ]}
    >
      <DataTable
        columns={columns}
        data={assets}
        searchPlaceholder="Search assets..."
        moduleColor="hr"
        filterOptions={[{
          column: "status",
          label: "Status",
          options: [
            { value: "AVAILABLE", label: "Available" },
            { value: "ASSIGNED", label: "Assigned" },
            { value: "UNDER_REPAIR", label: "Under Repair" },
            { value: "RETIRED", label: "Retired" },
            { value: "LOST", label: "Lost" },
          ],
        }]}
        emptyState={{ title: "No assets yet", description: "Add assets to start tracking." }}
      />

      <AssetDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSave={(data) => createAsset.mutate(data, { onSuccess: () => setCreateOpen(false) })}
        saving={createAsset.isPending}
      />

      <AssetDialog
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        initial={editTarget ?? undefined}
        onSave={(data) => updateAsset.mutate(data, { onSuccess: () => setEditTarget(null) })}
        saving={updateAsset.isPending}
        editMode
      />

      <AssignDialog
        open={!!assignTarget}
        onClose={() => setAssignTarget(null)}
        users={users}
        onAssign={(userId) => assignAsset.mutate({ userId }, { onSuccess: () => setAssignTarget(null) })}
        saving={assignAsset.isPending}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete asset"
        description={`Delete "${deleteTarget?.name}"?`}
        variant="destructive"
        confirmLabel="Delete"
        onConfirm={() => { if (deleteTarget) deleteAsset.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) }); }}
        loading={deleteAsset.isPending}
      />
    </ListPageLayout>
  );
}

function AssetDialog({ open, onClose, onSave, saving, initial, editMode }: {
  open: boolean;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => void;
  saving: boolean;
  initial?: Asset;
  editMode?: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [serialNumber, setSerialNumber] = useState(initial?.serialNumber ?? "");
  const [status, setStatus] = useState(initial?.status ?? "AVAILABLE");
  const [purchasePrice, setPurchasePrice] = useState<number | null>(initial?.purchasePrice ?? null);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>{editMode ? "Edit Asset" : "New Asset"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <FormField label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} /></FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Category"><Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Laptop, Monitor..." /></FormField>
            <FormField label="Serial #"><Input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} /></FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Status">
              <Select value={status} onValueChange={setStatus} options={[
                { value: "AVAILABLE", label: "Available" },
                { value: "ASSIGNED", label: "Assigned" },
                { value: "UNDER_REPAIR", label: "Under Repair" },
                { value: "RETIRED", label: "Retired" },
                { value: "LOST", label: "Lost" },
              ]} />
            </FormField>
            <FormField label="Purchase Price"><NumberInput value={purchasePrice} onChange={setPurchasePrice} prefix="INR" /></FormField>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={() => onSave({ name, category, serialNumber, status, purchasePrice })} disabled={saving || !name}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AssignDialog({ open, onClose, users, onAssign, saving }: {
  open: boolean;
  onClose: () => void;
  users: UserRow[];
  onAssign: (userId: string) => void;
  saving: boolean;
}) {
  const [userId, setUserId] = useState("");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>Assign Asset</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <FormField label="Employee" required>
            <Select value={userId} onValueChange={setUserId} options={users.map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName}` }))} />
          </FormField>
          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={() => onAssign(userId)} disabled={saving || !userId}>
              {saving ? "Assigning..." : "Assign"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
