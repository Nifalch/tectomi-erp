"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Download, X } from "lucide-react";
import { ListPageLayout } from "@/components/layouts/list-page-layout";
import { DataTable } from "@/components/ui/data-table";
import { Tabs } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { NumberInput } from "@/components/ui/number-input";
import { TextArea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { usePayments, useClients, useVendors, useInvoices, useBills, useBankAccounts } from "@/lib/api/hooks";
import { useCreatePayment } from "@/lib/api/mutations";
import { formatCurrency, toArray } from "@/lib/utils";
import { downloadCsv, rowsToCsv } from "@/lib/utils/csv";
import type { ColumnDef } from "@tanstack/react-table";

interface PaymentRow {
  id: string;
  paymentNumber: string;
  // Different code paths use `date` vs `paymentDate`. The API actually
  // returns `paymentDate` (matches the schema column); `date` was an
  // older alias kept for compatibility — both are mapped down below.
  date?: string;
  paymentDate?: string;
  type: "RECEIVED" | "MADE";
  amount: number;
  method?: string;
  reference?: string;
  notes?: string;
  expenseCategory?: string;
  client?: { companyName?: string };
  vendor?: { name?: string; companyName?: string };
  bankAccount?: { id?: string; name?: string };
  bankAccountId?: string;
}

interface Allocation { docId: string; amount: number }

export default function PaymentsPage() {
  const [activeTab, setActiveTab] = useState<"RECEIVED" | "MADE">("RECEIVED");
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"RECEIVED" | "MADE">("RECEIVED");
  const [partyId, setPartyId] = useState("");
  const [amount, setAmount] = useState<number>(0);
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [method, setMethod] = useState("BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [allocations, setAllocations] = useState<Record<string, number>>({});

  const paymentsQ = usePayments();
  const clientsQ = useClients();
  const vendorsQ = useVendors();
  const invoicesQ = useInvoices();
  const billsQ = useBills();
  const banksQ = useBankAccounts();
  const createMutation = useCreatePayment();

  const payments = toArray<PaymentRow>(paymentsQ.data);
  const clients = toArray<{ id: string; companyName: string }>(clientsQ.data);
  const vendors = toArray<{ id: string; name?: string; companyName?: string }>(vendorsQ.data);
  const invoices = toArray<{ id: string; invoiceNumber: string; clientId: string; total: number; amountPaid?: number; status: string }>(invoicesQ.data);
  const bills = toArray<{ id: string; billNumber: string; vendorId: string; total: number; amountPaid?: number; status: string }>(billsQ.data);
  const banks = toArray<{ id: string; name: string; isPrimary?: boolean }>(banksQ.data);
  const primaryBankId = useMemo(
    () => banks.find((b) => b.isPrimary)?.id ?? banks[0]?.id ?? "",
    [banks],
  );

  // Default the bank-account picker to the primary account whenever the
  // Record-Payment dialog opens. Only fires when the field is empty so
  // re-opening after a deliberate change doesn't blow away the user's
  // selection. The dialog reset path (after a successful save) wipes
  // bankAccountId back to "", which then triggers this effect on the
  // next open and selects the primary again.
  useEffect(() => {
    if (open && !bankAccountId && primaryBankId) setBankAccountId(primaryBankId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, primaryBankId]);

  const openDocs = useMemo(() => {
    if (type === "RECEIVED") {
      return invoices
        .filter((i) => i.clientId === partyId && i.status !== "PAID" && i.status !== "DRAFT")
        .map((i) => ({ id: i.id, number: i.invoiceNumber, total: Number(i.total), balance: Number(i.total) - Number(i.amountPaid ?? 0) }));
    }
    return bills
      .filter((b) => b.vendorId === partyId && b.status !== "PAID")
      .map((b) => ({ id: b.id, number: b.billNumber, total: Number(b.total), balance: Number(b.total) - Number(b.amountPaid ?? 0) }));
  }, [type, partyId, invoices, bills]);

  const allocSum = Object.values(allocations).reduce((a, b) => a + b, 0);

  // ── Filters ──
  // Date range + category + bank account. Empty string = "any". The
  // date string `fromDate` / `toDate` are ISO-yyyy-mm-dd so they
  // compare lexicographically against payment.paymentDate slices.
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [bankFilter, setBankFilter] = useState<string>("");

  // Category options surfaced from data + the full ExpenseCategory enum
  // (we want the dropdown stable even before any expense has been
  // recorded in a given category).
  const EXPENSE_CATEGORIES = useMemo(
    () => [
      "RENT", "UTILITIES", "INTERNET", "SUBSCRIPTION", "OFFICE_SUPPLIES",
      "TRAVEL", "MEALS", "EQUIPMENT", "MARKETING", "PROFESSIONAL_FEES",
      "SALARY", "INSURANCE", "REPAIRS", "TRAINING", "TAXES", "OTHER",
    ],
    [],
  );
  const categoryLabel = (k: string) =>
    k.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  if (paymentsQ.isLoading) return <LoadingState label="Loading payments..." />;
  if (paymentsQ.isError) return <ErrorState label="Unable to load payments." />;

  // Normalize payment row date — backend returns paymentDate; some older
  // rows used date. Always work off paymentDate downstream.
  const pmtDate = (p: PaymentRow) => (p.paymentDate ?? p.date ?? "").slice(0, 10);

  const filtered = payments.filter((p) => {
    if (p.type !== activeTab) return false;
    const d = pmtDate(p);
    if (fromDate && d < fromDate) return false;
    if (toDate && d > toDate) return false;
    if (categoryFilter && p.expenseCategory !== categoryFilter) return false;
    if (bankFilter && p.bankAccount?.id !== bankFilter && p.bankAccountId !== bankFilter) return false;
    return true;
  });

  const filteredSum = filtered.reduce((s, p) => s + Number(p.amount || 0), 0);
  const activeFilterCount =
    (fromDate ? 1 : 0) + (toDate ? 1 : 0) + (categoryFilter ? 1 : 0) + (bankFilter ? 1 : 0);

  const clearFilters = () => {
    setFromDate(""); setToDate(""); setCategoryFilter(""); setBankFilter("");
  };

  /** Download the current (filtered + active tab) view as a CSV.
   *  Columns are chosen to match what an accountant would expect when
   *  reconciling — date, party, amount, method, category, account,
   *  reference, notes. Filename includes the range so the file is
   *  self-describing once it lands in Downloads. */
  const exportFiltered = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const fromTag = fromDate || "all";
    const toTag = toDate || "all";
    const filename = `${activeTab.toLowerCase()}-payments-${fromTag}-to-${toTag}-${stamp}.csv`;
    const csv = rowsToCsv<PaymentRow>(filtered, [
      { label: "Date", map: (p) => pmtDate(p) },
      { label: "Payment #", key: "paymentNumber" },
      { label: "Type", key: "type" },
      { label: "Party", map: (p) => p.client?.companyName ?? p.vendor?.companyName ?? p.vendor?.name ?? "" },
      { label: "Amount (INR)", map: (p) => Number(p.amount || 0).toFixed(2) },
      { label: "Category", map: (p) => p.expenseCategory ? categoryLabel(p.expenseCategory) : "" },
      { label: "Method", key: "method" },
      { label: "Bank Account", map: (p) => p.bankAccount?.name ?? "" },
      { label: "Reference", key: "reference" },
      { label: "Notes", key: "notes" },
    ]);
    downloadCsv(filename, csv);
  };

  const columns: ColumnDef<PaymentRow, unknown>[] = [
    { accessorKey: "paymentNumber", header: "Payment #", cell: ({ row }) => <span className="font-medium">{row.original.paymentNumber}</span> },
    {
      id: "date",
      header: "Date",
      // The API field is paymentDate; older code referenced `date`. Read
      // either so the column never blanks out.
      cell: ({ row }) => {
        const iso = row.original.paymentDate ?? row.original.date;
        return iso ? new Date(iso).toLocaleDateString() : "—";
      },
    },
    { id: "party", header: "Party", cell: ({ row }) => row.original.client?.companyName ?? row.original.vendor?.name ?? row.original.vendor?.companyName ?? "—" },
    { accessorKey: "amount", header: "Amount", cell: ({ row }) => formatCurrency(Number(row.original.amount) || 0) },
    {
      id: "category",
      header: "Category",
      cell: ({ row }) => row.original.expenseCategory ? categoryLabel(row.original.expenseCategory) : "—",
    },
    { accessorKey: "method", header: "Method", cell: ({ row }) => row.original.method ?? "—" },
    { id: "bank", header: "Bank", cell: ({ row }) => row.original.bankAccount?.name ?? "—" },
    { accessorKey: "reference", header: "Reference", cell: ({ row }) => row.original.reference ?? "—" },
  ];

  const resetForm = () => {
    setPartyId(""); setAmount(0); setReference(""); setNotes(""); setBankAccountId(""); setAllocations({});
  };

  const submit = () => {
    if (!partyId || !amount || !date) return;
    if (openDocs.length > 0 && Math.abs(allocSum - amount) > 0.01) {
      alert("Sum of allocations must equal payment amount");
      return;
    }
    const payload: Record<string, unknown> = {
      type,
      amount,
      paymentDate: date.toISOString().slice(0, 10),
      method,
      reference: reference || undefined,
      notes: notes || undefined,
      bankAccountId: bankAccountId || undefined,
      allocations: Object.entries(allocations).filter(([, a]) => a > 0).map(([docId, amt]) => ({
        [type === "RECEIVED" ? "invoiceId" : "billId"]: docId,
        amount: amt,
      })),
    };
    if (type === "RECEIVED") payload.clientId = partyId;
    else payload.vendorId = partyId;

    createMutation.mutate(payload, {
      onSuccess: () => { setOpen(false); resetForm(); },
    });
  };

  return (
    <ListPageLayout
      module="accounts"
      title="Payments"
      description="Record received and made payments with invoice/bill allocations."
      primaryAction={{ label: "Record Payment", icon: <Plus className="mr-1 size-4" />, onClick: () => { setType(activeTab); setOpen(true); } }}
      counts={[
        { label: "received", value: payments.filter((p) => p.type === "RECEIVED").length, tone: "positive" },
        { label: "made", value: payments.filter((p) => p.type === "MADE").length, tone: "info" },
      ]}
    >
      <Tabs
        tabs={[
          { key: "RECEIVED", label: "Received", count: payments.filter((p) => p.type === "RECEIVED").length },
          { key: "MADE", label: "Made", count: payments.filter((p) => p.type === "MADE").length },
        ]}
        activeTab={activeTab}
        onTabChange={(k) => setActiveTab(k as "RECEIVED" | "MADE")}
      />

      {/* ── Filters + Export ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/40">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="mt-1 h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">To</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="mt-1 h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
          {activeTab === "MADE" && (
            <div className="min-w-[180px]">
              <label className="block text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Category</label>
              <Select
                value={categoryFilter}
                onValueChange={setCategoryFilter}
                placeholder="All categories"
                options={[
                  { value: "", label: "All categories" },
                  ...EXPENSE_CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c) })),
                ]}
              />
            </div>
          )}
          <div className="min-w-[180px]">
            <label className="block text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Bank account</label>
            <Select
              value={bankFilter}
              onValueChange={setBankFilter}
              placeholder="All accounts"
              options={[
                { value: "", label: "All accounts" },
                ...banks.map((b) => ({ value: b.id, label: b.name })),
              ]}
            />
          </div>

          <div className="ml-auto flex items-center gap-2">
            {activeFilterCount > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                <X className="mr-1 size-3.5" /> Clear ({activeFilterCount})
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={exportFiltered}
              disabled={filtered.length === 0}
            >
              <Download className="mr-1 size-4" /> Export CSV
            </Button>
          </div>
        </div>
        {/* Summary strip — makes the filter effect immediately legible. */}
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-500 dark:border-slate-800">
          <span>
            Showing <span className="font-semibold text-slate-700 dark:text-slate-200">{filtered.length}</span>{" "}
            of {payments.filter((p) => p.type === activeTab).length} {activeTab.toLowerCase()} payment{filtered.length === 1 ? "" : "s"}
          </span>
          <span>
            Filtered total:{" "}
            <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">
              {formatCurrency(filteredSum)}
            </span>
          </span>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        searchPlaceholder="Search payments..."
        moduleColor="accounts"
        emptyState={{ title: "No payments", description: "Record your first payment, or clear the filters above." }}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="xl">
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <FormField label="Type">
                <Select
                  value={type}
                  onValueChange={(v) => { setType(v as "RECEIVED" | "MADE"); setPartyId(""); setAllocations({}); }}
                  options={[{ value: "RECEIVED", label: "Received" }, { value: "MADE", label: "Made" }]}
                />
              </FormField>
              <FormField label={type === "RECEIVED" ? "Client" : "Vendor"} required>
                <Select
                  value={partyId}
                  onValueChange={(v) => { setPartyId(v); setAllocations({}); }}
                  placeholder={`Select ${type === "RECEIVED" ? "client" : "vendor"}`}
                  options={
                    type === "RECEIVED"
                      ? clients.map((c) => ({ value: c.id, label: c.companyName }))
                      : vendors.map((v) => ({ value: v.id, label: v.name ?? v.companyName ?? "" }))
                  }
                />
              </FormField>
              <FormField label="Amount" required>
                <NumberInput value={amount} onChange={(v) => setAmount(v ?? 0)} prefix="INR" />
              </FormField>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <FormField label="Date"><DatePicker value={date} onChange={(d) => setDate(d)} /></FormField>
              <FormField label="Method">
                <Select
                  value={method}
                  onValueChange={setMethod}
                  options={[
                    { value: "CASH", label: "Cash" },
                    { value: "BANK_TRANSFER", label: "Bank Transfer" },
                    { value: "CHEQUE", label: "Cheque" },
                    { value: "UPI", label: "UPI" },
                    { value: "CARD", label: "Card" },
                    { value: "OTHER", label: "Other" },
                  ]}
                />
              </FormField>
              <FormField label="Bank Account">
                <Select value={bankAccountId} onValueChange={setBankAccountId} placeholder="Select" options={banks.map((b) => ({ value: b.id, label: b.name }))} />
              </FormField>
            </div>
            <FormField label="Reference"><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transaction ref #" /></FormField>
            <FormField label="Notes"><TextArea value={notes} onChange={(e) => setNotes(e.target.value)} /></FormField>

            {partyId && openDocs.length > 0 && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">Allocate to {type === "RECEIVED" ? "Invoices" : "Bills"}</span>
                  <span className={`text-xs ${Math.abs(allocSum - amount) < 0.01 ? "text-emerald-600" : "text-amber-600"}`}>
                    Allocated: {formatCurrency(allocSum)} / {formatCurrency(amount)}
                  </span>
                </div>
                <div className="rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border bg-slate-50 text-xs uppercase dark:bg-slate-900">
                      <tr>
                        <th className="px-3 py-2 text-left">#</th>
                        <th className="px-3 py-2 text-right">Total</th>
                        <th className="px-3 py-2 text-right">Balance</th>
                        <th className="px-3 py-2 text-right">Allocate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openDocs.map((d) => (
                        <tr key={d.id} className="border-b border-border/50">
                          <td className="px-3 py-2">{d.number}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(d.total)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(d.balance)}</td>
                          <td className="px-3 py-2">
                            <NumberInput
                              value={allocations[d.id] ?? 0}
                              onChange={(v) => setAllocations({ ...allocations, [d.id]: v ?? 0 })}
                              prefix="INR"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={createMutation.isPending}>{createMutation.isPending ? "Saving..." : "Record Payment"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListPageLayout>
  );
}
