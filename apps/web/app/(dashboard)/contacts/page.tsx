"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { ListPageLayout } from "@/components/layouts/list-page-layout";
import { DataTable } from "@/components/ui/data-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Drawer } from "@/components/ui/drawer";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useContacts, useClients } from "@/lib/api/hooks";
import { useCreateContact, useUpdateContact, useDeleteContact } from "@/lib/api/mutations";
import { toArray } from "@/lib/utils";
import { createActionsColumn, type RowAction } from "@/components/ui/data-table-row-actions";
import type { ColumnDef } from "@tanstack/react-table";

interface Client {
  id: string;
  companyName: string;
}

interface ContactRow {
  id: string;
  clientId: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  title?: string;
  isPrimary?: boolean;
  notes?: string;
  client?: { companyName?: string };
}

const schema = z.object({
  clientId: z.string().min(1, "Client is required"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  title: z.string().optional(),
  isPrimary: z.boolean().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function ContactsPage() {
  const query = useContacts();
  const clientsQuery = useClients();
  const createMutation = useCreateContact();
  const deleteMutation = useDeleteContact();

  const [createOpen, setCreateOpen] = useState(false);
  const [editContact, setEditContact] = useState<ContactRow | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<ContactRow | undefined>();

  const updateMutation = useUpdateContact(editContact?.id ?? "");

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { clientId: "", firstName: "", lastName: "", email: "", phone: "", title: "", notes: "", isPrimary: false },
  });

  useEffect(() => {
    if (editContact) {
      form.reset({
        clientId: editContact.clientId,
        firstName: editContact.firstName,
        lastName: editContact.lastName,
        email: editContact.email ?? "",
        phone: editContact.phone ?? "",
        title: editContact.title ?? "",
        notes: editContact.notes ?? "",
        isPrimary: !!editContact.isPrimary,
      });
    }
  }, [editContact, form]);

  if (query.isLoading) return <LoadingState label="Loading contacts..." />;
  if (query.isError || !query.data) return <ErrorState label="Unable to load contacts." />;

  const contacts = toArray<ContactRow>(query.data);
  const clients = toArray<Client>(clientsQuery.data);

  const rowActions: RowAction<ContactRow>[] = [
    { label: "Edit", icon: <Pencil className="size-4" />, onClick: (row) => setEditContact(row) },
    { label: "Delete", icon: <Trash2 className="size-4" />, onClick: (row) => setDeleteTarget(row), destructive: true, separator: true },
  ];

  const columns: ColumnDef<ContactRow, unknown>[] = [
    {
      id: "name",
      header: "Name",
      cell: ({ row }) => (
        <span className="font-medium">
          {row.original.firstName} {row.original.lastName}
        </span>
      ),
    },
    { accessorKey: "email", header: "Email", cell: ({ row }) => row.original.email ?? "—" },
    { accessorKey: "phone", header: "Phone", cell: ({ row }) => row.original.phone ?? "—" },
    { accessorKey: "title", header: "Title", cell: ({ row }) => row.original.title ?? "—" },
    {
      id: "client",
      header: "Company",
      cell: ({ row }) =>
        row.original.client?.companyName ??
        clients.find((c) => c.id === row.original.clientId)?.companyName ??
        "—",
    },
    {
      id: "primary",
      header: "Primary",
      cell: ({ row }) =>
        row.original.isPrimary ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600">
            <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
            Primary
          </span>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        ),
    },
    createActionsColumn(rowActions),
  ];

  const isEdit = !!editContact;

  const onSubmit = (values: FormValues) => {
    const payload = {
      ...values,
      email: values.email || undefined,
    };
    if (isEdit) {
      updateMutation.mutate(payload as Record<string, unknown>, {
        onSuccess: () => {
          setEditContact(undefined);
          form.reset();
        },
      });
    } else {
      createMutation.mutate(payload as Parameters<typeof createMutation.mutate>[0], {
        onSuccess: () => {
          setCreateOpen(false);
          form.reset();
        },
      });
    }
  };

  return (
    <ListPageLayout
      module="clients"
      title="Contacts"
      description="Client-side contacts and decision makers."
      primaryAction={{
        label: "New Contact",
        icon: <Plus className="mr-1 size-4" />,
        onClick: () => {
          setEditContact(undefined);
          form.reset({ clientId: "", firstName: "", lastName: "", email: "", phone: "", title: "", notes: "", isPrimary: false });
          setCreateOpen(true);
        },
      }}
      counts={[
        { label: "primary", value: contacts.filter((c) => c.isPrimary).length, tone: "positive" },
        { label: "total", value: contacts.length },
      ]}
    >
      <DataTable
        columns={columns}
        data={contacts}
        searchPlaceholder="Search contacts..."
        moduleColor="clients"
        emptyState={{ title: "No contacts yet", description: "Create your first contact to start tracking." }}
      />

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>New Contact</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField label="Client" required error={form.formState.errors.clientId?.message}>
              <Select
                value={form.watch("clientId")}
                onValueChange={(v) => form.setValue("clientId", v, { shouldValidate: true })}
                error={!!form.formState.errors.clientId}
                placeholder="Select client"
                options={clients.map((c) => ({ value: c.id, label: c.companyName }))}
              />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="First Name" required error={form.formState.errors.firstName?.message}>
                <Input {...form.register("firstName")} error={!!form.formState.errors.firstName} />
              </FormField>
              <FormField label="Last Name" required error={form.formState.errors.lastName?.message}>
                <Input {...form.register("lastName")} error={!!form.formState.errors.lastName} />
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Email" error={form.formState.errors.email?.message}>
                <Input {...form.register("email")} type="email" />
              </FormField>
              <FormField label="Phone">
                <Input {...form.register("phone")} />
              </FormField>
            </div>
            <FormField label="Title">
              <Input {...form.register("title")} placeholder="e.g. VP of Marketing" />
            </FormField>
            <FormField label="Notes">
              <TextArea {...form.register("notes")} />
            </FormField>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...form.register("isPrimary")} />
              Primary contact for this client
            </label>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Contact"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit drawer */}
      <Drawer
        open={!!editContact}
        onOpenChange={(open) => { if (!open) setEditContact(undefined); }}
        title="Edit Contact"
        size="md"
      >
        {editContact && (
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField label="Client" required error={form.formState.errors.clientId?.message}>
              <Select
                value={form.watch("clientId")}
                onValueChange={(v) => form.setValue("clientId", v, { shouldValidate: true })}
                error={!!form.formState.errors.clientId}
                placeholder="Select client"
                options={clients.map((c) => ({ value: c.id, label: c.companyName }))}
              />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="First Name" required error={form.formState.errors.firstName?.message}>
                <Input {...form.register("firstName")} error={!!form.formState.errors.firstName} />
              </FormField>
              <FormField label="Last Name" required error={form.formState.errors.lastName?.message}>
                <Input {...form.register("lastName")} error={!!form.formState.errors.lastName} />
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Email" error={form.formState.errors.email?.message}>
                <Input {...form.register("email")} type="email" />
              </FormField>
              <FormField label="Phone">
                <Input {...form.register("phone")} />
              </FormField>
            </div>
            <FormField label="Title">
              <Input {...form.register("title")} />
            </FormField>
            <FormField label="Notes">
              <TextArea {...form.register("notes")} />
            </FormField>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...form.register("isPrimary")} />
              Primary contact for this client
            </label>
            <div className="flex justify-end gap-3 pt-3">
              <Button type="button" variant="secondary" onClick={() => setEditContact(undefined)}>Cancel</Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        )}
      </Drawer>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(undefined); }}
        title="Delete contact"
        description={`Delete "${deleteTarget?.firstName ?? ""} ${deleteTarget?.lastName ?? ""}"?`}
        variant="destructive"
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(undefined) });
        }}
        loading={deleteMutation.isPending}
      />
    </ListPageLayout>
  );
}
