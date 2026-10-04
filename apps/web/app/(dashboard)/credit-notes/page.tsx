"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { ListPageLayout } from "@/components/layouts/list-page-layout";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { NumberInput } from "@/components/ui/number-input";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { LineItemsEditor, computeTotals, type LineItem } from "@/components/accounting/line-items-editor";
import { useCreditNotes, useClients, useInvoices, useItems, useTaxRates } from "@/lib/api/hooks";
import { useCreateCreditNote, useApplyCreditToInvoice } from "@/lib/api/mutations";
import { formatCurrency, toArray } from "@/lib/utils";
import { createActionsColumn, type RowAction } from "@/components/ui/data-table-row-actions";
import type { ColumnDef } from "@tanstack/react-table";

interface CreditRow {
  id: string;
  creditNoteNumber: string;
  client: { companyName?: string };
  invoice?: { invoiceNumber?: string };
  issueDate: string;
  total: number;
  amountApplied?: number;
  status: string;
}

export default function CreditNotesPage() {
  const query = useCreditNotes();
  const clientsQ = useClients();
  const invoicesQ = useInvoices();
  const itemsQ = useItems();
  const taxesQ = useTaxRates();
  const createMutation = useCreateCreditNote();
  const applyMutation = useApplyCreditToInvoice();

  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [issueDate, setIssueDate] = useState<Date | undefined>(new Date());
  const [reason, setReason] = useState("");
  const [items, setItems] = useState<LineItem[]>([{ description: "", quantity: 1, price: 0 }]);

  const [applyTarget, setApplyTarget] = useState<CreditRow | null>(null);
  const [applyInvoiceId, setApplyInvoiceId] = useState("");
  const [applyAmount, setApplyAmount] = useState(0);

  if (query.isLoading) return <LoadingState label="Loading credit notes..." />;
  if (query.isError) return <ErrorState label="Unable to load credit notes." />;

  const rows = toArray<CreditRow>(query.data);
  const clients = toArray<{ id: string; companyName: string }>(clientsQ.data);
  const invoices = toArray<{ id: string; invoiceNumber: string; clientId: string }>(invoicesQ.data);
  const taxRates = toArray<{ id: string; name: string; rate: number }>(taxesQ.data);

  const filteredInvoices = invoices.filter((i) => !clientId || i.clientId === clientId);

  const totals = computeTotals(items, taxRates);

  const resetForm = () => { setClientId(""); setInvoiceId(""); setReason(""); setItems([{ description: "", quantity: 1, price: 0 }]); };

  const submit = () => {
    if (!clientId || !issueDate) return;
    createMutation.mutate({
      clientId,
      invoiceId: invoiceId || undefined,
      issueDate: issueDate.toISOString(),
      reason: reason || undefined,
      items: items.filter((i) => i.description).map((i) => ({
        itemId: i.itemId || undefined,
        description: i.description,
        quantity: i.quantity,
        price: i.price,
        taxRateId: i.taxRateId || undefined,
      })),
    }, { onSuccess: () => { setOpen(false); resetForm(); } });
  };

  const rowActions: RowAction<CreditRow>[] = [
    { label: "Apply to Invoice", onClick: (r) => { setApplyTarget(r); setApplyInvoiceId(""); setApplyAmount(Number(r.total) - Number(r.amountApplied ?? 0)); } },
  ];

  const columns: ColumnDef<CreditRow, unknown>[] = [
    { accessorKey: "creditNoteNumber", header: "Credit #", cell: ({ row }) => <span className="font-medium">{row.original.creditNoteNumber}</span> },
    { id: "client", header: "Client", cell: ({ row }) => row.original.client?.companyName ?? "—" },
    { id: "invoice", header: "Invoice", cell: ({ row }) => row.original.invoice?.invoiceNumber ?? "—" },
    { accessorKey: "issueDate", header: "Issue Date", cell: ({ row }) => row.original.issueDate ? new Date(row.original.issueDate).toLocaleDateString() : "—" },
    { accessorKey: "total", header: "Total", cell: ({ row }) => formatCurrency(Number(row.original.total) || 0) },
    { id: "applied", header: "Applied", cell: ({ row }) => formatCurrency(Number(row.original.amountApplied) || 0) },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    createActionsColumn(rowActions),
  ];

  return (
    <ListPageLayout
      module="accounts"
      title="Credit Notes"
      description="Refund credits issued to clients."
      primaryAction={{ label: "New Credit Note", icon: <Plus className="mr-1 size-4" />, onClick: () => setOpen(true) }}
    >
      <DataTable columns={columns} data={rows} searchPlaceholder="Search credit notes..." moduleColor="accounts"
        emptyState={{ title: "No credit notes", description: "Issue credit when refunds or returns apply." }} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="xl">
          <DialogHeader><DialogTitle>New Credit Note</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <FormField label="Client" required>
                <Select value={clientId} onValueChange={(v) => { setClientId(v); setInvoiceId(""); }} placeholder="Select client"
                  options={clients.map((c) => ({ value: c.id, label: c.companyName }))} />
              </FormField>
              <FormField label="Invoice (optional)">
                <Select value={invoiceId} onValueChange={setInvoiceId} placeholder="Link to invoice"
                  options={[{ value: "", label: "None" }, ...filteredInvoices.map((i) => ({ value: i.id, label: i.invoiceNumber }))]} />
              </FormField>
              <FormField label="Issue Date"><DatePicker value={issueDate} onChange={setIssueDate} /></FormField>
            </div>
            <FormField label="Reason"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this credit is issued" /></FormField>
            <LineItemsEditor items={items} onChange={setItems} taxRates={taxRates} />
            <div className="text-right text-sm">
              Subtotal: <span className="font-medium">{formatCurrency(totals.subtotal)}</span> · Tax: <span className="font-medium">{formatCurrency(totals.tax)}</span> · <span className="text-base font-bold">Total: {formatCurrency(totals.total)}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={createMutation.isPending}>{createMutation.isPending ? "Saving..." : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!applyTarget} onOpenChange={(o) => { if (!o) setApplyTarget(null); }}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>Apply Credit to Invoice</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <FormField label="Invoice" required>
              <Select value={applyInvoiceId} onValueChange={setApplyInvoiceId} placeholder="Select invoice"
                options={invoices.filter((i) => applyTarget && i.clientId === (rows.find((r) => r.id === applyTarget.id) as unknown as { clientId?: string })?.clientId)
                  .map((i) => ({ value: i.id, label: i.invoiceNumber }))} />
            </FormField>
            <FormField label="Amount" required>
              <NumberInput value={applyAmount} onChange={(v) => setApplyAmount(v ?? 0)} prefix="INR" />
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setApplyTarget(null)}>Cancel</Button>
            <Button disabled={!applyInvoiceId || !applyAmount} onClick={() => {
              if (!applyTarget) return;
              applyMutation.mutate({ id: applyTarget.id, invoiceId: applyInvoiceId, amount: applyAmount }, {
                onSuccess: () => setApplyTarget(null),
              });
            }}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListPageLayout>
  );
}
