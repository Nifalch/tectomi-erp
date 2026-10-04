"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Pencil, Trash2 } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { ListPageLayout } from "@/components/layouts/list-page-layout";
import { DataTable } from "@/components/ui/data-table";
import { Tabs } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { NumberInput } from "@/components/ui/number-input";
import { TextArea } from "@/components/ui/textarea";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { createActionsColumn, type RowAction } from "@/components/ui/data-table-row-actions";
import {
  useExpenses,
  useRecurringExpenses,
  useVendors,
  useBankAccounts,
} from "@/lib/api/hooks";
import {
  useCreatePayment,
  useCreateRecurringExpense,
  useUpdateRecurringExpense,
  useDeleteRecurringExpense,
  useGenerateDueExpenses,
} from "@/lib/api/mutations";
import { toast } from "@/lib/hooks/use-toast";
import { formatCurrency, toArray } from "@/lib/utils";

// Categories shared with the backend ExpenseCategory enum — labels stay
// in one place so cards / forms / tables don't drift apart.
const CATEGORIES = [
  { value: "RENT", label: "Rent" },
  { value: "UTILITIES", label: "Utilities" },
  { value: "INTERNET", label: "Internet" },
  { value: "SUBSCRIPTION", label: "Subscriptions" },
  { value: "OFFICE_SUPPLIES", label: "Office Supplies" },
  { value: "TRAVEL", label: "Travel" },
  { value: "MEALS", label: "Meals" },
  { value: "EQUIPMENT", label: "Equipment" },
  { value: "MARKETING", label: "Marketing" },
  { value: "PROFESSIONAL_FEES", label: "Professional Fees" },
  { value: "SALARY", label: "Salary" },
  { value: "INSURANCE", label: "Insurance" },
  { value: "REPAIRS", label: "Repairs" },
  { value: "TRAINING", label: "Training" },
  { value: "TAXES", label: "Taxes" },
  { value: "OTHER", label: "Other" },
] as const;
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));

const FREQUENCIES = [
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "HALF_YEARLY", label: "Half-yearly" },
  { value: "YEARLY", label: "Yearly" },
];

const METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "CARD", label: "Card" },
  { value: "UPI", label: "UPI" },
  { value: "CHECK", label: "Cheque" },
  { value: "OTHER", label: "Other" },
];

interface ExpenseRow {
  id: string;
  paymentNumber: string;
  paymentDate: string;
  amount: number;
  method?: string;
  expenseCategory?: string;
  notes?: string;
  reference?: string;
  recurringExpenseId?: string;
  vendor?: { id: string; companyName?: string };
  bankAccount?: { id: string; name: string };
  allocations?: Array<{ billId?: string; invoiceId?: string }>;
}

interface RecurringExpenseRow {
  id: string;
  title: string;
  category: string;
  amount: number;
  frequency: string;
  dayOfMonth: number;
  startDate: string;
  endDate?: string | null;
  isActive: boolean;
  notes?: string;
  method?: string;
  vendorId?: string | null;
  bankAccountId?: string | null;
  vendor?: { id: string; companyName?: string } | null;
  bankAccount?: { id: string; name: string } | null;
  nextDueDate?: string | null;
  lastGeneratedFor?: string | null;
}

export default function ExpensesPage() {
  const [tab, setTab] = useState<"all" | "recurring">("all");

  // One-off expense dialog
  const [oneOffOpen, setOneOffOpen] = useState(false);
  const [ooDate, setOoDate] = useState<Date>(new Date());
  const [ooAmount, setOoAmount] = useState<number>(0);
  const [ooCategory, setOoCategory] = useState<string>("OTHER");
  const [ooMethod, setOoMethod] = useState<string>("BANK_TRANSFER");
  const [ooBankId, setOoBankId] = useState<string>("");
  const [ooVendorId, setOoVendorId] = useState<string>("");
  const [ooNotes, setOoNotes] = useState<string>("");
  const [ooReference, setOoReference] = useState<string>("");

  // Recurring template dialog
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [recTitle, setRecTitle] = useState("");
  const [recCategory, setRecCategory] = useState("SUBSCRIPTION");
  const [recVendorId, setRecVendorId] = useState("");
  const [recAmount, setRecAmount] = useState<number>(0);
  const [recMethod, setRecMethod] = useState("BANK_TRANSFER");
  const [recBankId, setRecBankId] = useState("");
  const [recFrequency, setRecFrequency] = useState("MONTHLY");
  const [recDayOfMonth, setRecDayOfMonth] = useState<number>(1);
  const [recStartDate, setRecStartDate] = useState<Date>(new Date());
  const [recEndDate, setRecEndDate] = useState<Date | undefined>(undefined);
  const [recIsActive, setRecIsActive] = useState(true);
  const [recNotes, setRecNotes] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<RecurringExpenseRow | undefined>();

  const expensesQ = useExpenses();
  const recurringQ = useRecurringExpenses();
  const vendorsQ = useVendors();
  const banksQ = useBankAccounts();

  const createPayment = useCreatePayment();
  const createRecurring = useCreateRecurringExpense();
  const updateRecurring = useUpdateRecurringExpense(editingId ?? "");
  const deleteRecurring = useDeleteRecurringExpense();
  const generateDue = useGenerateDueExpenses();

  const expenses = toArray<ExpenseRow>(expensesQ.data);
  const recurring = toArray<RecurringExpenseRow>(recurringQ.data);
  const vendors = toArray<{ id: string; companyName?: string; name?: string }>(vendorsQ.data);
  const banks = toArray<{ id: string; name: string; isPrimary?: boolean }>(banksQ.data);
  const primaryBankId = useMemo(
    () => banks.find((b) => b.isPrimary)?.id ?? banks[0]?.id ?? "",
    [banks],
  );

  // Default each bank-account picker to the primary account when its
  // dialog opens — most expenses come out of the main bank, so pre-
  // selecting it saves a click. Only fires when the field is empty so
  // an explicit user choice (including "None") sticks.
  useEffect(() => {
    if (oneOffOpen && !ooBankId && primaryBankId) setOoBankId(primaryBankId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oneOffOpen, primaryBankId]);
  useEffect(() => {
    if (recurringOpen && !recBankId && primaryBankId) setRecBankId(primaryBankId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recurringOpen, primaryBankId]);

  // Roll-up totals by category for the cards strip at the top of the page.
  const categoryTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) {
      const key = e.expenseCategory ?? "UNCATEGORIZED";
      map.set(key, (map.get(key) ?? 0) + Number(e.amount ?? 0));
    }
    return Array.from(map.entries())
      .map(([key, total]) => ({ key, total, label: key === "UNCATEGORIZED" ? "Uncategorized" : CATEGORY_LABEL[key] ?? key }))
      .sort((a, b) => b.total - a.total);
  }, [expenses]);

  const totalSpend = useMemo(() => expenses.reduce((s, e) => s + Number(e.amount ?? 0), 0), [expenses]);
  // Anything due today or earlier (still active) shows up in the banner.
  const dueCount = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return recurring.filter((r) => {
      if (!r.isActive || !r.nextDueDate) return false;
      const due = new Date(r.nextDueDate);
      return due <= today;
    }).length;
  }, [recurring]);

  if (expensesQ.isLoading || recurringQ.isLoading) return <LoadingState label="Loading expenses..." />;
  if (expensesQ.isError) return <ErrorState label="Unable to load expenses." />;

  const resetOneOff = () => {
    setOoDate(new Date()); setOoAmount(0); setOoCategory("OTHER"); setOoMethod("BANK_TRANSFER");
    setOoBankId(""); setOoVendorId(""); setOoNotes(""); setOoReference("");
  };
  const resetRecurring = () => {
    setEditingId(null);
    setRecTitle(""); setRecCategory("SUBSCRIPTION"); setRecVendorId(""); setRecAmount(0);
    setRecMethod("BANK_TRANSFER"); setRecBankId(""); setRecFrequency("MONTHLY");
    setRecDayOfMonth(1); setRecStartDate(new Date()); setRecEndDate(undefined);
    setRecIsActive(true); setRecNotes("");
  };
  const openEditRecurring = (row: RecurringExpenseRow) => {
    setEditingId(row.id);
    setRecTitle(row.title);
    setRecCategory(row.category);
    setRecVendorId(row.vendorId ?? "");
    setRecAmount(Number(row.amount));
    setRecMethod(row.method ?? "BANK_TRANSFER");
    setRecBankId(row.bankAccountId ?? "");
    setRecFrequency(row.frequency);
    setRecDayOfMonth(row.dayOfMonth);
    setRecStartDate(new Date(row.startDate));
    setRecEndDate(row.endDate ? new Date(row.endDate) : undefined);
    setRecIsActive(row.isActive);
    setRecNotes(row.notes ?? "");
    setRecurringOpen(true);
  };

  const submitOneOff = () => {
    if (!ooAmount || ooAmount <= 0) {
      toast({ variant: "error", title: "Amount required" });
      return;
    }
    createPayment.mutate(
      {
        type: "MADE",
        amount: ooAmount,
        paymentDate: ooDate.toISOString().slice(0, 10),
        method: ooMethod,
        reference: ooReference || undefined,
        notes: ooNotes || undefined,
        vendorId: ooVendorId || undefined,
        bankAccountId: ooBankId || undefined,
        expenseCategory: ooCategory,
      },
      { onSuccess: () => { setOneOffOpen(false); resetOneOff(); } },
    );
  };

  const submitRecurring = () => {
    if (!recTitle.trim() || !recAmount || recAmount <= 0) {
      toast({ variant: "error", title: "Title and amount required" });
      return;
    }
    const payload = {
      title: recTitle.trim(),
      category: recCategory,
      vendorId: recVendorId || undefined,
      amount: recAmount,
      method: recMethod,
      bankAccountId: recBankId || undefined,
      frequency: recFrequency,
      dayOfMonth: recDayOfMonth,
      startDate: recStartDate.toISOString().slice(0, 10),
      endDate: recEndDate ? recEndDate.toISOString().slice(0, 10) : undefined,
      isActive: recIsActive,
      notes: recNotes || undefined,
    };
    if (editingId) {
      updateRecurring.mutate(payload, { onSuccess: () => { setRecurringOpen(false); resetRecurring(); } });
    } else {
      createRecurring.mutate(payload, { onSuccess: () => { setRecurringOpen(false); resetRecurring(); } });
    }
  };

  const expenseColumns: ColumnDef<ExpenseRow, unknown>[] = [
    { accessorKey: "paymentDate", header: "Date",
      cell: ({ row }) => row.original.paymentDate ? new Date(row.original.paymentDate).toLocaleDateString() : "—" },
    { accessorKey: "paymentNumber", header: "Ref",
      cell: ({ row }) => <span className="font-medium">{row.original.paymentNumber}</span> },
    { id: "category", header: "Category",
      cell: ({ row }) => row.original.expenseCategory
        ? <Badge tone="info" size="sm">{CATEGORY_LABEL[row.original.expenseCategory] ?? row.original.expenseCategory}</Badge>
        : <span className="text-xs text-slate-400">—</span> },
    { id: "source", header: "Source",
      cell: ({ row }) => {
        if (row.original.recurringExpenseId) return <Badge tone="positive" size="sm">Recurring</Badge>;
        const hasBill = (row.original.allocations ?? []).some((a) => a.billId);
        if (hasBill) return <Badge tone="neutral" size="sm">Bill</Badge>;
        return <Badge tone="neutral" size="sm">One-off</Badge>;
      } },
    { id: "vendor", header: "Vendor",
      cell: ({ row }) => row.original.vendor?.companyName ?? <span className="text-xs text-slate-400">—</span> },
    { accessorKey: "amount", header: "Amount",
      cell: ({ row }) => <span className="font-semibold tabular-nums">{formatCurrency(Number(row.original.amount) || 0)}</span> },
    { accessorKey: "method", header: "Method",
      cell: ({ row }) => row.original.method ?? "—" },
    { id: "bank", header: "Bank",
      cell: ({ row }) => row.original.bankAccount?.name ?? "—" },
    { id: "notes", header: "Notes",
      cell: ({ row }) => <span className="text-xs text-slate-500">{row.original.notes ?? row.original.reference ?? ""}</span> },
  ];

  const recurringActions: RowAction<RecurringExpenseRow>[] = [
    { label: "Edit", icon: <Pencil className="size-4" />, onClick: openEditRecurring },
    { label: "Delete", icon: <Trash2 className="size-4" />, onClick: (row) => setDeleteTarget(row), destructive: true, separator: true },
  ];

  const recurringColumns: ColumnDef<RecurringExpenseRow, unknown>[] = [
    { accessorKey: "title", header: "Title", cell: ({ row }) => <span className="font-medium">{row.original.title}</span> },
    { id: "category", header: "Category",
      cell: ({ row }) => <Badge tone="info" size="sm">{CATEGORY_LABEL[row.original.category] ?? row.original.category}</Badge> },
    { accessorKey: "amount", header: "Amount",
      cell: ({ row }) => <span className="tabular-nums">{formatCurrency(Number(row.original.amount) || 0)}</span> },
    { accessorKey: "frequency", header: "Frequency",
      cell: ({ row }) => row.original.frequency.replace("_", " ").toLowerCase() },
    { id: "next", header: "Next due",
      cell: ({ row }) => row.original.nextDueDate
        ? new Date(row.original.nextDueDate).toLocaleDateString()
        : <span className="text-xs text-slate-400">—</span> },
    { id: "vendor", header: "Vendor",
      cell: ({ row }) => row.original.vendor?.companyName ?? <span className="text-xs text-slate-400">—</span> },
    { id: "status", header: "Status",
      cell: ({ row }) => row.original.isActive
        ? <Badge tone="positive" size="sm">Active</Badge>
        : <Badge tone="neutral" size="sm">Paused</Badge> },
    createActionsColumn(recurringActions),
  ];

  return (
    <ListPageLayout
      module="accounts"
      title="Expenses"
      description="Everything that drained the main account — recurring subs, rent, utilities, one-off spends, and bill payments."
      primaryAction={{ label: "New Expense", icon: <Plus className="mr-1 size-4" />, onClick: () => setOneOffOpen(true) }}
      counts={[
        { label: "total entries", value: expenses.length, tone: "info" },
        { label: "this month", value: expenses.filter((e) => {
            const d = new Date(e.paymentDate);
            const now = new Date();
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
          }).length },
        { label: "recurring active", value: recurring.filter((r) => r.isActive).length, tone: "positive" },
      ]}
    >
      {/* Banner: any recurring templates that are due to be posted today.
          One-click "Generate" creates the Payments + JE for each due cycle. */}
      {dueCount > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-700/40 dark:bg-amber-900/20">
          <div className="text-sm text-amber-900 dark:text-amber-100">
            <strong>{dueCount}</strong> recurring expense{dueCount === 1 ? " is" : "s are"} due. Generate to post them to the GL and bank.
          </div>
          <Button
            variant="default"
            size="sm"
            onClick={() => generateDue.mutate()}
            disabled={generateDue.isPending}
          >
            <RefreshCw className={`mr-1 size-4 ${generateDue.isPending ? "animate-spin" : ""}`} />
            {generateDue.isPending ? "Generating…" : "Generate due"}
          </Button>
        </div>
      )}

      {/* Category roll-up cards — first card is the grand total in a darker
          tone, then top categories ranked by spend so the user can spot
          where the money is going at a glance. */}
      {categoryTotals.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <div className="rounded-xl border border-slate-900 bg-slate-900 p-3 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900">
            <div className="text-xs uppercase tracking-wide opacity-80">Total spend</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{formatCurrency(totalSpend)}</div>
          </div>
          {categoryTotals.slice(0, 9).map((c) => (
            <div key={c.key} className="rounded-xl border border-border bg-white p-3 dark:bg-slate-900/60">
              <div className="text-xs uppercase tracking-wide text-slate-500">{c.label}</div>
              <div className="mt-1 text-lg font-semibold tabular-nums">{formatCurrency(c.total)}</div>
            </div>
          ))}
        </div>
      )}

      <Tabs
        tabs={[
          { key: "all", label: "All Expenses", count: expenses.length },
          { key: "recurring", label: "Recurring", count: recurring.length },
        ]}
        activeTab={tab}
        onTabChange={(k) => setTab(k as "all" | "recurring")}
      />

      {tab === "all" ? (
        <DataTable
          columns={expenseColumns}
          data={expenses}
          searchPlaceholder="Search expenses..."
          moduleColor="accounts"
          emptyState={{ title: "No expenses yet", description: "Log a one-off expense, set up a recurring subscription, or pay a bill." }}
        />
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-slate-500">Templates auto-generate a Payment + journal entry each cycle.</span>
            <Button variant="default" size="sm" onClick={() => { resetRecurring(); setRecurringOpen(true); }}>
              <Plus className="mr-1 size-4" /> New Recurring
            </Button>
          </div>
          <DataTable
            columns={recurringColumns}
            data={recurring}
            searchPlaceholder="Search templates..."
            moduleColor="accounts"
            emptyState={{ title: "No recurring expenses", description: "Set up monthly rent, SaaS subscriptions, utilities, etc." }}
          />
        </>
      )}

      {/* ── One-off expense dialog ── */}
      <Dialog open={oneOffOpen} onOpenChange={(o) => { setOneOffOpen(o); if (!o) resetOneOff(); }}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>New Expense</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <FormField label="Date">
                <DatePicker value={ooDate} onChange={(d) => d && setOoDate(d)} />
              </FormField>
              <FormField label="Amount" required>
                <NumberInput value={ooAmount} onChange={(v) => setOoAmount(v ?? 0)} prefix="₹" />
              </FormField>
              <FormField label="Category">
                <Select value={ooCategory} onValueChange={setOoCategory} options={CATEGORIES.map((c) => ({ value: c.value, label: c.label }))} />
              </FormField>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <FormField label="Method">
                <Select value={ooMethod} onValueChange={setOoMethod} options={METHODS} />
              </FormField>
              <FormField label="Bank">
                <Select value={ooBankId} onValueChange={setOoBankId} placeholder="—" options={[{ value: "", label: "None" }, ...banks.map((b) => ({ value: b.id, label: b.name }))]} />
              </FormField>
              <FormField label="Vendor (optional)">
                <Select value={ooVendorId} onValueChange={setOoVendorId} placeholder="—" options={[{ value: "", label: "None" }, ...vendors.map((v) => ({ value: v.id, label: v.companyName ?? v.name ?? "" }))]} />
              </FormField>
            </div>
            <FormField label="Reference"><Input value={ooReference} onChange={(e) => setOoReference(e.target.value)} placeholder="Receipt / txn ref" /></FormField>
            <FormField label="Notes"><TextArea value={ooNotes} onChange={(e) => setOoNotes(e.target.value)} placeholder="Optional context" /></FormField>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOneOffOpen(false)}>Cancel</Button>
            <Button onClick={submitOneOff} disabled={createPayment.isPending}>
              {createPayment.isPending ? "Saving…" : "Save Expense"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Recurring template dialog ── */}
      <Dialog open={recurringOpen} onOpenChange={(o) => { setRecurringOpen(o); if (!o) resetRecurring(); }}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>{editingId ? "Edit Recurring Expense" : "New Recurring Expense"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <FormField label="Title" required>
              <Input value={recTitle} onChange={(e) => setRecTitle(e.target.value)} placeholder="e.g. Office Rent" />
            </FormField>
            <div className="grid grid-cols-3 gap-4">
              <FormField label="Category">
                <Select value={recCategory} onValueChange={setRecCategory} options={CATEGORIES.map((c) => ({ value: c.value, label: c.label }))} />
              </FormField>
              <FormField label="Amount" required>
                <NumberInput value={recAmount} onChange={(v) => setRecAmount(v ?? 0)} prefix="₹" />
              </FormField>
              <FormField label="Vendor (optional)">
                <Select value={recVendorId} onValueChange={setRecVendorId} placeholder="—" options={[{ value: "", label: "None" }, ...vendors.map((v) => ({ value: v.id, label: v.companyName ?? v.name ?? "" }))]} />
              </FormField>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <FormField label="Frequency">
                <Select value={recFrequency} onValueChange={setRecFrequency} options={FREQUENCIES} />
              </FormField>
              <FormField label="Day of cycle">
                <NumberInput value={recDayOfMonth} onChange={(v) => setRecDayOfMonth(v ?? 1)} min={1} max={31} />
              </FormField>
              <FormField label="Method">
                <Select value={recMethod} onValueChange={setRecMethod} options={METHODS} />
              </FormField>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <FormField label="Start date">
                <DatePicker value={recStartDate} onChange={(d) => d && setRecStartDate(d)} />
              </FormField>
              <FormField label="End date (optional)">
                <DatePicker value={recEndDate} onChange={(d) => setRecEndDate(d)} />
              </FormField>
              <FormField label="Bank">
                <Select value={recBankId} onValueChange={setRecBankId} placeholder="—" options={[{ value: "", label: "None" }, ...banks.map((b) => ({ value: b.id, label: b.name }))]} />
              </FormField>
            </div>
            <FormField label="Active">
              <Select value={recIsActive ? "true" : "false"} onValueChange={(v) => setRecIsActive(v === "true")}
                options={[{ value: "true", label: "Active (generate each cycle)" }, { value: "false", label: "Paused" }]} />
            </FormField>
            <FormField label="Notes"><TextArea value={recNotes} onChange={(e) => setRecNotes(e.target.value)} placeholder="Vendor portal, contract details, etc." /></FormField>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRecurringOpen(false)}>Cancel</Button>
            <Button onClick={submitRecurring} disabled={createRecurring.isPending || updateRecurring.isPending}>
              {(createRecurring.isPending || updateRecurring.isPending) ? "Saving…" : editingId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) setDeleteTarget(undefined); }}
        title="Delete recurring expense"
        description={`Stop generating "${deleteTarget?.title}"? Past payments stay; only the template is removed.`}
        variant="destructive"
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteTarget) deleteRecurring.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(undefined) });
        }}
        loading={deleteRecurring.isPending}
      />
    </ListPageLayout>
  );
}
