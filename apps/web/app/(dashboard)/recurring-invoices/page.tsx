"use client";

import { useState } from "react";
import { Plus, Pause, Play, Square, Zap, Trash2 } from "lucide-react";
import { ListPageLayout } from "@/components/layouts/list-page-layout";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { LineItemsEditor, computeTotals, type LineItem } from "@/components/accounting/line-items-editor";
import { useRecurringInvoices, useClients, useProjects, useItems, useTaxRates } from "@/lib/api/hooks";
import { useCreateRecurringInvoice, usePauseRecurring, useResumeRecurring, useEndRecurring, useRunDueRecurring, useDeleteRecurringInvoice } from "@/lib/api/mutations";
import { formatCurrency, toArray } from "@/lib/utils";
import { createActionsColumn, type RowAction } from "@/components/ui/data-table-row-actions";
import type { ColumnDef } from "@tanstack/react-table";

interface RecurringRow {
  id: string;
  name: string;
  client: { companyName?: string };
  frequency: string;
  nextRunAt?: string;
  total: number;
  status: string;
}

export default function RecurringInvoicesPage() {
  const query = useRecurringInvoices();
  const clientsQ = useClients();
  const projectsQ = useProjects();
  const itemsQ = useItems();
  const taxesQ = useTaxRates();

  const createMutation = useCreateRecurringInvoice();
  const pauseMutation = usePauseRecurring();
  const resumeMutation = useResumeRecurring();
  const endMutation = useEndRecurring();
  const runMutation = useRunDueRecurring();
  const deleteMutation = useDeleteRecurringInvoice();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [frequency, setFrequency] = useState("MONTHLY");
  const [startDate, setStartDate] = useState<Date | undefined>(new Date());
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [items, setItems] = useState<LineItem[]>([{ description: "", quantity: 1, price: 0 }]);

  if (query.isLoading) return <LoadingState label="Loading recurring invoices..." />;
  if (query.isError) return <ErrorState label="Unable to load recurring invoices." />;

  const rows = toArray<RecurringRow>(query.data);
  const clients = toArray<{ id: string; companyName: string }>(clientsQ.data);
  const projects = toArray<{ id: string; name: string }>(projectsQ.data);
  const taxRates = toArray<{ id: string; name: string; rate: number }>(taxesQ.data);

  const totals = computeTotals(items, taxRates);

  const submit = () => {
    if (!name || !clientId || !startDate) return;
    createMutation.mutate({
      name,
      clientId,
      projectId: projectId || undefined,
      frequency,
      startDate: startDate.toISOString(),
      endDate: endDate?.toISOString(),
      items: items.filter((i) => i.description).map((i) => ({
        itemId: i.itemId || undefined,
        description: i.description,
        quantity: i.quantity,
        price: i.price,
        taxRateId: i.taxRateId || undefined,
      })),
    }, {
      onSuccess: () => {
        setOpen(false);
        setName(""); setClientId(""); setProjectId(""); setFrequency("MONTHLY");
        setItems([{ description: "", quantity: 1, price: 0 }]);
      },
    });
  };

  const rowActions: RowAction<RecurringRow>[] = [
    { label: "Pause", icon: <Pause className="size-4" />, onClick: (r) => pauseMutation.mutate(r.id) },
    { label: "Resume", icon: <Play className="size-4" />, onClick: (r) => resumeMutation.mutate(r.id) },
    { label: "End", icon: <Square className="size-4" />, onClick: (r) => endMutation.mutate(r.id) },
    { label: "Run Now", icon: <Zap className="size-4" />, onClick: (r) => runMutation.mutate(undefined, { onSuccess: () => void r }) },
    { label: "Delete", icon: <Trash2 className="size-4" />, onClick: (r) => { if (confirm(`Delete "${r.name}"?`)) deleteMutation.mutate(r.id); }, destructive: true, separator: true },
  ];

  const columns: ColumnDef<RecurringRow, unknown>[] = [
    { accessorKey: "name", header: "Name", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { id: "client", header: "Client", cell: ({ row }) => row.original.client?.companyName ?? "—" },
    { accessorKey: "frequency", header: "Frequency" },
    { accessorKey: "nextRunAt", header: "Next Run", cell: ({ row }) => row.original.nextRunAt ? new Date(row.original.nextRunAt).toLocaleDateString() : "—" },
    { accessorKey: "total", header: "Total", cell: ({ row }) => formatCurrency(Number(row.original.total) || 0) },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    createActionsColumn(rowActions),
  ];

  return (
    <ListPageLayout module="invoices" title="Recurring Invoices" description="Schedule invoices that repeat automatically."
      primaryAction={{ label: "New Recurring", icon: <Plus className="mr-1 size-4" />, onClick: () => setOpen(true) }}>
      <div className="mb-4 flex justify-end">
        <Button variant="secondary" size="sm" onClick={() => runMutation.mutate()} disabled={runMutation.isPending}>
          <Zap className="mr-1 size-4" /> Run due invoices
        </Button>
      </div>

      <DataTable columns={columns} data={rows} searchPlaceholder="Search..." moduleColor="invoices"
        emptyState={{ title: "No recurring invoices", description: "Schedule repeat billing." }} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="xl">
          <DialogHeader><DialogTitle>New Recurring Invoice</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Monthly Retainer" /></FormField>
              <FormField label="Client" required>
                <Select value={clientId} onValueChange={setClientId} placeholder="Select client"
                  options={clients.map((c) => ({ value: c.id, label: c.companyName }))} />
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Project">
                <Select value={projectId} onValueChange={setProjectId} placeholder="Optional"
                  options={[{ value: "", label: "None" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]} />
              </FormField>
              <FormField label="Frequency">
                <Select value={frequency} onValueChange={setFrequency}
                  options={[
                    { value: "WEEKLY", label: "Weekly" },
                    { value: "MONTHLY", label: "Monthly" },
                    { value: "QUARTERLY", label: "Quarterly" },
                    { value: "YEARLY", label: "Yearly" },
                  ]} />
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Start Date" required><DatePicker value={startDate} onChange={setStartDate} /></FormField>
              <FormField label="End Date (optional)"><DatePicker value={endDate} onChange={setEndDate} /></FormField>
            </div>
            <LineItemsEditor items={items} onChange={setItems} taxRates={taxRates} />
            <div className="text-right text-sm">Total: <span className="font-bold">{formatCurrency(totals.total)}</span></div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={createMutation.isPending}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListPageLayout>
  );
}
