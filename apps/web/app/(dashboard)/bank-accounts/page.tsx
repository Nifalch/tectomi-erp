"use client";

import { useState } from "react";
import { Plus, Landmark, CheckCircle2, Pencil, Trash2, MoreHorizontal } from "lucide-react";
import { ListPageLayout } from "@/components/layouts/list-page-layout";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Drawer } from "@/components/ui/drawer";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { NumberInput } from "@/components/ui/number-input";
import { DatePicker } from "@/components/ui/date-picker";
import { TextArea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useBankAccounts, useBankTransactions } from "@/lib/api/hooks";
import { useCreateBankAccount, useUpdateBankAccount, useDeleteBankAccount, useCreateBankTransaction, useReconcileBankTxn } from "@/lib/api/mutations";
import { formatCurrency, toArray } from "@/lib/utils";
import { usePermission } from "@/lib/hooks/use-permission";

interface BankAccount {
  id: string;
  name: string;
  bankName?: string;
  accountNumber?: string;
  currency?: string;
  currentBalance?: number;
  openingBalance?: number;
  type?: string;
  isActive?: boolean;
}

interface BankTxn {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: "CREDIT" | "DEBIT";
  runningBalance?: number;
  reconciled?: boolean;
}

function mask(num?: string) {
  if (!num) return "—";
  const s = String(num);
  return s.length <= 4 ? s : "•".repeat(s.length - 4) + s.slice(-4);
}

const TYPE_OPTIONS = [
  { value: "BANK", label: "Bank" },
  { value: "CASH", label: "Cash" },
  { value: "CREDIT_CARD", label: "Credit Card" },
];

const CURRENCY_OPTIONS = [
  { value: "INR", label: "INR" },
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
  { value: "GBP", label: "GBP" },
  { value: "AED", label: "AED" },
  { value: "SGD", label: "SGD" },
];

interface AccountFormState {
  name: string;
  bankName: string;
  accountNumber: string;
  currency: string;
  type: string;
  openingBalance: number;
}

const emptyForm: AccountFormState = {
  name: "",
  bankName: "",
  accountNumber: "",
  currency: "INR",
  type: "BANK",
  openingBalance: 0,
};

export default function BankAccountsPage() {
  const query = useBankAccounts();
  const createMutation = useCreateBankAccount();
  const canUpdate = usePermission("finance:update");
  const canDelete = usePermission("finance:delete");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AccountFormState>(emptyForm);

  const updateMutation = useUpdateBankAccount(editingId ?? "");
  const deleteMutation = useDeleteBankAccount();
  const [deleteTarget, setDeleteTarget] = useState<BankAccount | null>(null);

  const [drawerAccount, setDrawerAccount] = useState<BankAccount | null>(null);
  const [txnDialogOpen, setTxnDialogOpen] = useState(false);
  const [txnDate, setTxnDate] = useState<Date | undefined>(new Date());
  const [txnDesc, setTxnDesc] = useState("");
  const [txnAmount, setTxnAmount] = useState(0);
  const [txnType, setTxnType] = useState<"CREDIT" | "DEBIT">("CREDIT");
  const [txnNotes, setTxnNotes] = useState("");

  const txnQuery = useBankTransactions(drawerAccount?.id ?? "");
  const createTxnMutation = useCreateBankTransaction(drawerAccount?.id ?? "");
  const reconcileMutation = useReconcileBankTxn();

  if (query.isLoading) return <LoadingState label="Loading bank accounts..." />;
  if (query.isError) return <ErrorState label="Unable to load bank accounts." />;

  const accounts = toArray<BankAccount>(query.data);
  const txns = toArray<BankTxn>(txnQuery.data);

  const totalBalance = accounts.reduce((sum, a) => sum + Number(a.currentBalance ?? 0), 0);
  const reconciledCount = txns.filter((t) => t.reconciled).length;

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (account: BankAccount) => {
    setEditingId(account.id);
    setForm({
      name: account.name ?? "",
      bankName: account.bankName ?? "",
      accountNumber: account.accountNumber ?? "",
      currency: account.currency ?? "INR",
      type: account.type ?? "BANK",
      openingBalance: Number(account.openingBalance ?? 0),
    });
    setDialogOpen(true);
  };

  const submitAccount = () => {
    if (!form.name.trim()) return;
    const payload: Record<string, unknown> = {
      name: form.name,
      bankName: form.bankName || undefined,
      accountNumber: form.accountNumber || undefined,
      currency: form.currency,
      type: form.type,
    };
    const onDone = { onSuccess: () => { setDialogOpen(false); setEditingId(null); setForm(emptyForm); } };
    if (editingId) {
      updateMutation.mutate(payload, onDone);
    } else {
      createMutation.mutate({ ...payload, openingBalance: form.openingBalance }, onDone);
    }
  };

  const submitTxn = () => {
    if (!txnDate || !txnDesc || !txnAmount) return;
    createTxnMutation.mutate({
      date: txnDate.toISOString(),
      description: txnDesc,
      amount: txnAmount,
      type: txnType,
      // The DB column is `reference` (check #, UPI ref, memo) — the UI
      // historically labeled it "Notes". Don't send a `notes` key: the API
      // DTO rejects unknown fields.
      reference: txnNotes || undefined,
    }, {
      onSuccess: () => {
        setTxnDialogOpen(false);
        setTxnDesc(""); setTxnAmount(0); setTxnNotes("");
      },
    });
  };

  const confirmDelete = (force = false) => {
    if (!deleteTarget) return;
    deleteMutation.mutate({ id: deleteTarget.id, force }, {
      onSuccess: () => setDeleteTarget(null),
    });
  };

  return (
    <ListPageLayout module="accounts" title="Bank Accounts" description="Bank balances, transactions, and reconciliation."
      primaryAction={{ label: "Add Bank Account", icon: <Plus className="mr-1 size-4" />, onClick: openCreate, permission: "finance:create" }}>
      {accounts.length > 0 && (
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-white p-4 dark:bg-slate-900/80">
            <div className="text-xs uppercase tracking-wide text-slate-500">Total Balance</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{formatCurrency(totalBalance)}</div>
          </div>
          <div className="rounded-xl border border-border bg-white p-4 dark:bg-slate-900/80">
            <div className="text-xs uppercase tracking-wide text-slate-500">Accounts</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{accounts.length}</div>
          </div>
          <div className="rounded-xl border border-border bg-white p-4 dark:bg-slate-900/80">
            <div className="text-xs uppercase tracking-wide text-slate-500">Active</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{accounts.filter((a) => a.isActive !== false).length}</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((a) => (
          <div key={a.id} className="group relative rounded-2xl border border-border bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-panel dark:bg-slate-900/80">
            <button onClick={() => setDrawerAccount(a)} className="block w-full text-left">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Landmark className="size-4 text-slate-500" />
                    <span className="truncate font-semibold">{a.name}</span>
                  </div>
                  <div className="mt-1 truncate text-xs text-slate-500">{a.bankName ?? ""}</div>
                </div>
                <Badge tone="info" size="sm">{a.type ?? "BANK"}</Badge>
              </div>
              <div className="mt-5">
                <div className="text-xs uppercase tracking-wide text-slate-400">Balance</div>
                <div className="text-2xl font-bold tabular-nums">{formatCurrency(Number(a.currentBalance ?? 0))} <span className="text-sm font-normal text-slate-500">{a.currency ?? "INR"}</span></div>
              </div>
              <div className="mt-3 font-mono text-xs text-slate-500">{mask(a.accountNumber)}</div>
            </button>

            {(canUpdate || canDelete) && (
              <div className="absolute right-3 top-3 opacity-0 transition group-hover:opacity-100">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                      aria-label="Account actions"
                    >
                      <MoreHorizontal className="size-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {canUpdate && (
                      <DropdownMenuItem onClick={() => openEdit(a)}>
                        <Pencil className="mr-2 size-4" /> Edit
                      </DropdownMenuItem>
                    )}
                    {canDelete && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setDeleteTarget(a)} className="text-red-600 focus:text-red-600">
                          <Trash2 className="mr-2 size-4" /> Delete
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        ))}
        {accounts.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-border p-10 text-center text-sm text-slate-500">
            No bank accounts yet. Add one to start tracking balances.
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) { setDialogOpen(false); setEditingId(null); setForm(emptyForm); } }}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>{editingId ? "Edit Bank Account" : "New Bank Account"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <FormField label="Name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Primary Business" /></FormField>
            <FormField label="Bank Name"><Input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} placeholder="HDFC Bank" /></FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Account Number"><Input value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} /></FormField>
              <FormField label="Type"><Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })} options={TYPE_OPTIONS} /></FormField>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Currency"><Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })} options={CURRENCY_OPTIONS} /></FormField>
              {!editingId && (
                <FormField label="Opening Balance">
                  <NumberInput value={form.openingBalance} onChange={(v) => setForm({ ...form, openingBalance: v ?? 0 })} prefix={form.currency} />
                </FormField>
              )}
            </div>
            {editingId && (
              <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800/50">
                Opening balance can't be changed after creation. To adjust the current balance, post a manual transaction.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => { setDialogOpen(false); setEditingId(null); setForm(emptyForm); }}>Cancel</Button>
            <Button onClick={submitAccount} disabled={createMutation.isPending || updateMutation.isPending}>
              {editingId ? (updateMutation.isPending ? "Saving..." : "Save Changes") : (createMutation.isPending ? "Creating..." : "Create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        title="Delete bank account"
        description={
          deleteTarget
            ? `Delete "${deleteTarget.name}"? Linked payments will be detached. If the account has transactions, the server will block this and you can confirm a force delete.`
            : ""
        }
        variant="destructive"
        confirmLabel={deleteMutation.isError ? "Force Delete" : "Delete"}
        onConfirm={() => confirmDelete(deleteMutation.isError)}
        loading={deleteMutation.isPending}
      />

      <Drawer open={!!drawerAccount} onOpenChange={(o) => { if (!o) setDrawerAccount(null); }}
        title={drawerAccount?.name ?? "Transactions"} description={drawerAccount?.bankName} size="lg">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">Current Balance</div>
            <div className="text-2xl font-bold tabular-nums">{formatCurrency(Number(drawerAccount?.currentBalance ?? 0))}</div>
            {txns.length > 0 && (
              <div className="mt-1 text-xs text-slate-500">{reconciledCount}/{txns.length} reconciled</div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {drawerAccount && canUpdate && (
              <Button variant="secondary" size="sm" onClick={() => { setDrawerAccount(null); openEdit(drawerAccount); }}>
                <Pencil className="mr-1 size-4" /> Edit
              </Button>
            )}
            {drawerAccount && canDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:text-red-700"
                onClick={() => { const target = drawerAccount; setDrawerAccount(null); setDeleteTarget(target); }}
              >
                <Trash2 className="mr-1 size-4" /> Delete
              </Button>
            )}
            <Button size="sm" onClick={() => setTxnDialogOpen(true)}><Plus className="mr-1 size-4" /> Add Transaction</Button>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead className="border-b border-border text-xs uppercase text-slate-500">
            <tr>
              <th className="py-2 text-left">Date</th>
              <th className="py-2 text-left">Description</th>
              <th className="py-2 text-right">Amount</th>
              <th className="py-2 text-right">Balance</th>
              <th className="py-2 text-right">Rec.</th>
            </tr>
          </thead>
          <tbody>
            {txns.map((t) => (
              <tr key={t.id} className="border-b border-border/50">
                <td className="py-2">{new Date(t.date).toLocaleDateString()}</td>
                <td className="py-2">{t.description}</td>
                <td className={`py-2 text-right tabular-nums ${t.type === "CREDIT" ? "text-emerald-600" : "text-red-500"}`}>
                  {t.type === "CREDIT" ? "+" : "-"} {formatCurrency(Number(t.amount) || 0)}
                </td>
                <td className="py-2 text-right tabular-nums">{formatCurrency(Number(t.runningBalance ?? 0))}</td>
                <td className="py-2 text-right">
                  {t.reconciled ? (
                    <CheckCircle2 className="ml-auto size-4 text-emerald-500" />
                  ) : drawerAccount ? (
                    <button className="text-xs text-blue-600 hover:underline" onClick={() => reconcileMutation.mutate({ accountId: drawerAccount.id, txnId: t.id })}>
                      Reconcile
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
            {txns.length === 0 && (
              <tr><td colSpan={5} className="py-8 text-center text-sm text-slate-400">No transactions.</td></tr>
            )}
          </tbody>
        </table>
      </Drawer>

      <Dialog open={txnDialogOpen} onOpenChange={setTxnDialogOpen}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>Add Transaction</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Date"><DatePicker value={txnDate} onChange={setTxnDate} /></FormField>
              <FormField label="Type">
                <Select value={txnType} onValueChange={(v) => setTxnType(v as "CREDIT" | "DEBIT")}
                  options={[{ value: "CREDIT", label: "Credit (Money In)" }, { value: "DEBIT", label: "Debit (Money Out)" }]} />
              </FormField>
            </div>
            <FormField label="Description" required><Input value={txnDesc} onChange={(e) => setTxnDesc(e.target.value)} /></FormField>
            <FormField label="Amount" required><NumberInput value={txnAmount} onChange={(v) => setTxnAmount(v ?? 0)} prefix={drawerAccount?.currency ?? "INR"} /></FormField>
            <FormField label="Reference / memo" description="UPI ref, check no., or free-text memo."><TextArea value={txnNotes} onChange={(e) => setTxnNotes(e.target.value)} /></FormField>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setTxnDialogOpen(false)}>Cancel</Button>
            <Button onClick={submitTxn} disabled={createTxnMutation.isPending}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListPageLayout>
  );
}
