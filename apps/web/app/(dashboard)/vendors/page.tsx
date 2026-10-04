"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost, apiPatch, apiDelete } from "@/lib/api/client";
import { ListPageLayout } from "@/components/layouts/list-page-layout";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useVendors } from "@/lib/api/hooks";
import { toast } from "@/lib/hooks/use-toast";
import { toArray } from "@/lib/utils";
import { createActionsColumn, type RowAction } from "@/components/ui/data-table-row-actions";
import type { ColumnDef } from "@tanstack/react-table";

interface VendorRow {
  id: string;
  companyName: string;
  contactName?: string;
  email?: string;
  phone?: string;
  category?: string;
  status: string;
}

const schema = z.object({
  companyName: z.string().min(1, "Company name required"),
  contactName: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  category: z.string().optional(),
  status: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

const statusTone: Record<string, "positive" | "neutral" | "destructive"> = {
  ACTIVE: "positive",
  INACTIVE: "neutral",
  SUSPENDED: "destructive",
};

export default function VendorsPage() {
  const query = useVendors();
  const qc = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPost("/vendors", data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["vendors"] }); toast({ variant: "success", title: "Vendor created" }); },
    onError: () => toast({ variant: "error", title: "Failed to create vendor" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => apiPatch(`/vendors/${id}`, data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["vendors"] }); toast({ variant: "success", title: "Vendor updated" }); },
    onError: () => toast({ variant: "error", title: "Failed to update vendor" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/vendors/${id}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["vendors"] }); toast({ variant: "success", title: "Vendor deleted" }); },
    onError: () => toast({ variant: "error", title: "Failed to delete vendor" }),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [editVendor, setEditVendor] = useState<VendorRow | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<VendorRow | undefined>();
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { status: "ACTIVE" } });

  useEffect(() => {
    if (editVendor) {
      form.reset({
        companyName: editVendor.companyName,
        contactName: editVendor.contactName ?? "",
        email: editVendor.email ?? "",
        phone: editVendor.phone ?? "",
        category: editVendor.category ?? "",
        status: editVendor.status,
      });
    }
  }, [editVendor, form]);

  if (query.isLoading) return <LoadingState label="Loading vendors..." />;
  if (query.isError || !query.data) return <ErrorState label="Unable to load vendors." />;

  const vendors = toArray<VendorRow>(query.data);

  const rowActions: RowAction<VendorRow>[] = [
    { label: "Edit", icon: <Pencil className="size-4" />, onClick: (row) => { setEditVendor(row); setCreateOpen(true); } },
    { label: "Delete", icon: <Trash2 className="size-4" />, onClick: (row) => setDeleteTarget(row), destructive: true, separator: true },
  ];

  const columns: ColumnDef<VendorRow, unknown>[] = [
    { accessorKey: "companyName", header: "Company", cell: ({ row }) => <span className="font-medium">{row.original.companyName}</span> },
    { accessorKey: "contactName", header: "Contact", cell: ({ row }) => row.original.contactName ?? "---" },
    { accessorKey: "email", header: "Email", cell: ({ row }) => row.original.email ?? "---" },
    { accessorKey: "phone", header: "Phone", cell: ({ row }) => row.original.phone ?? "---" },
    { accessorKey: "category", header: "Category", cell: ({ row }) => row.original.category ? <Badge tone="neutral" size="sm">{row.original.category}</Badge> : "---" },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <Badge tone={statusTone[row.original.status] ?? "neutral"} size="sm">{row.original.status}</Badge> },
    createActionsColumn(rowActions),
  ];

  const isEdit = !!editVendor;

  const onSubmit = (values: FormValues) => {
    if (isEdit) {
      updateMutation.mutate(
        { id: editVendor.id, data: values },
        { onSuccess: () => { setCreateOpen(false); setEditVendor(undefined); form.reset({ status: "ACTIVE" }); } },
      );
    } else {
      createMutation.mutate(values, { onSuccess: () => { setCreateOpen(false); form.reset({ status: "ACTIVE" }); } });
    }
  };

  return (
    <ListPageLayout
      module="accounts"
      title="Vendor Management"
      description="Manage vendor profiles, contacts, and categories."
      primaryAction={{ label: "New Vendor", icon: <Plus className="mr-1 size-4" />, onClick: () => { setEditVendor(undefined); setCreateOpen(true); } }}
      counts={[
        { label: "active", value: vendors.filter((v) => v.status === "ACTIVE").length, tone: "positive" },
        { label: "total", value: vendors.length },
      ]}
    >
      <DataTable columns={columns} data={vendors} searchPlaceholder="Search vendors..." emptyState={{ title: "No vendors", description: "Add your first vendor to get started." }} />

      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) setEditVendor(undefined); }}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>{isEdit ? "Edit Vendor" : "New Vendor"}</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField label="Company Name" required error={form.formState.errors.companyName?.message}>
              <Input {...form.register("companyName")} error={!!form.formState.errors.companyName} placeholder="Acme Supplies" />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Contact Name"><Input {...form.register("contactName")} placeholder="Jane Smith" /></FormField>
              <FormField label="Email" error={form.formState.errors.email?.message}><Input {...form.register("email")} error={!!form.formState.errors.email} placeholder="jane@acme.com" /></FormField>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Phone"><Input {...form.register("phone")} placeholder="+91 9876543210" /></FormField>
              <FormField label="Category">
                <Select value={form.watch("category") ?? ""} onValueChange={(v) => form.setValue("category", v)}
                  options={[{ value: "TECHNOLOGY", label: "Technology" }, { value: "OFFICE_SUPPLIES", label: "Office Supplies" }, { value: "CONSULTING", label: "Consulting" }, { value: "MARKETING", label: "Marketing" }, { value: "OTHER", label: "Other" }]} />
              </FormField>
            </div>
            <FormField label="Status">
              <Select value={form.watch("status")} onValueChange={(v) => form.setValue("status", v)}
                options={[{ value: "ACTIVE", label: "Active" }, { value: "INACTIVE", label: "Inactive" }, { value: "SUSPENDED", label: "Suspended" }]} />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : isEdit ? "Update Vendor" : "Create Vendor"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(undefined); }}
        title="Delete vendor" description={`Delete "${deleteTarget?.companyName}"? This cannot be undone.`} variant="destructive" confirmLabel="Delete"
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(undefined) }); }}
        loading={deleteMutation.isPending} />
    </ListPageLayout>
  );
}
