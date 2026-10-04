"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Database } from "lucide-react";
import { ListPageLayout } from "@/components/layouts/list-page-layout";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useChartAccounts } from "@/lib/api/hooks";
import { useCreateChartAccount, useUpdateChartAccount, useDeleteChartAccount, useSeedDefaultAccounts } from "@/lib/api/mutations";
import { formatCurrency, toArray } from "@/lib/utils";

interface AccountRow {
  id: string;
  code: string;
  name: string;
  type: string;
  subType?: string;
  parentId?: string;
  description?: string;
  balance?: number;
  isActive: boolean;
  isSystem?: boolean;
}

const TYPE_ORDER = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"] as const;
const TYPE_LABELS: Record<string, string> = {
  ASSET: "Assets", LIABILITY: "Liabilities", EQUITY: "Equity", INCOME: "Income", EXPENSE: "Expenses",
};
const SUBTYPES_BY_TYPE: Record<string, string[]> = {
  ASSET: ["CURRENT_ASSET", "FIXED_ASSET", "BANK", "CASH", "ACCOUNTS_RECEIVABLE", "OTHER_ASSET"],
  LIABILITY: ["CURRENT_LIABILITY", "LONG_TERM_LIABILITY", "ACCOUNTS_PAYABLE", "TAX", "OTHER_LIABILITY"],
  EQUITY: ["OWNERS_EQUITY", "RETAINED_EARNINGS"],
  INCOME: ["SALES", "OTHER_INCOME"],
  EXPENSE: ["OPERATING_EXPENSE", "COST_OF_GOODS_SOLD", "PAYROLL", "OTHER_EXPENSE"],
};

interface FormState {
  code: string; name: string; type: string; subType: string; parentId: string; description: string; isActive: boolean;
}
const emptyForm: FormState = { code: "", name: "", type: "ASSET", subType: "CURRENT_ASSET", parentId: "", description: "", isActive: true };

export default function ChartOfAccountsPage() {
  const query = useChartAccounts();
  const createMutation = useCreateChartAccount();
  const deleteMutation = useDeleteChartAccount();
  const seedMutation = useSeedDefaultAccounts();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const updateMutation = useUpdateChartAccount(editingId ?? "");

  if (query.isLoading) return <LoadingState label="Loading accounts..." />;
  if (query.isError) return <ErrorState label="Unable to load accounts." />;

  const rows = toArray<AccountRow>(query.data);
  const grouped: Record<string, AccountRow[]> = {};
  for (const r of rows) {
    (grouped[r.type] ??= []).push(r);
  }

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (r: AccountRow) => {
    setEditingId(r.id);
    setForm({
      code: r.code, name: r.name, type: r.type, subType: r.subType ?? "",
      parentId: r.parentId ?? "", description: r.description ?? "", isActive: r.isActive,
    });
    setDialogOpen(true);
  };

  const submit = () => {
    const payload = {
      code: form.code, name: form.name, type: form.type, subType: form.subType || undefined,
      parentId: form.parentId || undefined, description: form.description || undefined, isActive: form.isActive,
    };
    const onDone = { onSuccess: () => setDialogOpen(false) };
    if (editingId) updateMutation.mutate(payload, onDone);
    else createMutation.mutate(payload, onDone);
  };

  return (
    <ListPageLayout
      module="accounts"
      title="Chart of Accounts"
      description="Ledger accounts grouped by type."
      primaryAction={{ label: "Add Account", icon: <Plus className="mr-1 size-4" />, onClick: openCreate }}
    >
      <div className="mb-4 flex justify-end">
        <Button variant="secondary" size="sm" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
          <Database className="mr-1 size-4" /> Seed default accounts
        </Button>
      </div>

      <div className="space-y-4">
        {TYPE_ORDER.map((t) => {
          const list = grouped[t] ?? [];
          if (list.length === 0) return null;
          return (
            <div key={t} className="rounded-2xl border border-border bg-white dark:bg-slate-900/80">
              <div className="border-b border-border px-5 py-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                {TYPE_LABELS[t]} <span className="ml-2 text-xs font-normal text-slate-400">({list.length})</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase text-slate-400">
                    <th className="px-5 py-2 text-left">Code</th>
                    <th className="py-2 text-left">Name</th>
                    <th className="py-2 text-left">Sub Type</th>
                    <th className="py-2 text-right">Balance</th>
                    <th className="py-2 text-right pr-5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id} className="border-t border-border/50 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-5 py-2 font-mono text-xs">{r.code}</td>
                      <td className="py-2">
                        <div className="font-medium">{r.name}</div>
                        {!r.isActive && <Badge tone="neutral" size="sm">Inactive</Badge>}
                      </td>
                      <td className="py-2 text-xs text-slate-500">{r.subType ?? "—"}</td>
                      <td className="py-2 text-right tabular-nums">{formatCurrency(Number(r.balance ?? 0))}</td>
                      <td className="py-2 pr-5 text-right">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(r)}><Pencil className="size-3.5" /></Button>
                        <Button variant="ghost" size="sm" disabled={r.isSystem} onClick={() => { if (confirm(`Delete ${r.name}?`)) deleteMutation.mutate(r.id); }}>
                          <Trash2 className="size-3.5 text-red-500" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>{editingId ? "Edit Account" : "New Account"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Code" required><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="1000" /></FormField>
              <FormField label="Name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Bank - Primary" /></FormField>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Type" required>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v, subType: SUBTYPES_BY_TYPE[v]?.[0] ?? "" })}
                  options={TYPE_ORDER.map((t) => ({ value: t, label: TYPE_LABELS[t] }))} />
              </FormField>
              <FormField label="Sub Type">
                <Select value={form.subType} onValueChange={(v) => setForm({ ...form, subType: v })}
                  options={(SUBTYPES_BY_TYPE[form.type] ?? []).map((s) => ({ value: s, label: s.replace(/_/g, " ") }))} />
              </FormField>
            </div>
            <FormField label="Parent Account">
              <Select value={form.parentId} onValueChange={(v) => setForm({ ...form, parentId: v })} placeholder="None"
                options={[{ value: "", label: "None" }, ...rows.filter((r) => r.type === form.type && r.id !== editingId).map((r) => ({ value: r.id, label: `${r.code} · ${r.name}` }))]} />
            </FormField>
            <FormField label="Description"><TextArea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></FormField>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active
            </label>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={submit}>{editingId ? "Save" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListPageLayout>
  );
}
