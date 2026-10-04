"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TextArea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useEmployeePayroll } from "@/lib/api/employee-profile";
import { useFounderCapital } from "@/lib/api/hooks";
import {
  useAddFounderLedgerEntry,
  useDeleteFounderLedgerEntry,
  useSetDrawnAmount,
} from "@/lib/api/mutations";
import { useAuthStore } from "@/lib/store/auth-store";
import { formatCurrency } from "@/lib/utils";
import { Trash2 } from "lucide-react";

interface SalaryStructure {
  basic?: number | string;
  hra?: number | string;
  conveyance?: number | string;
  medical?: number | string;
  specialAllowance?: number | string;
  otherAllowance?: number | string;
  pfDeduction?: number | string;
  taxDeduction?: number | string;
  otherDeductions?: number | string;
  effectiveFrom?: string;
}

interface PaySlip {
  id: string;
  month: number;
  year: number;
  basic: number | string;
  hra: number | string;
  allowances: number | string;
  grossSalary: number | string;
  pfDeduction: number | string;
  taxDeduction: number | string;
  otherDeductions: number | string;
  netSalary: number | string;
  drawnAmount?: number | string | null;
  deferredAmount?: number | string;
  workingDays: number;
  paidDays: number;
  leaveDays: number;
  status: "PENDING" | "PAID";
  paidAt?: string | null;
  paymentReference?: string | null;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const EARNINGS: Array<{ key: keyof SalaryStructure; label: string }> = [
  { key: "basic", label: "Basic" },
  { key: "hra", label: "HRA" },
  { key: "conveyance", label: "Conveyance" },
  { key: "medical", label: "Medical" },
  { key: "specialAllowance", label: "Special Allowance" },
  { key: "otherAllowance", label: "Other Allowance" },
];
const DEDUCTIONS: Array<{ key: keyof SalaryStructure; label: string }> = [
  { key: "pfDeduction", label: "PF" },
  { key: "taxDeduction", label: "Tax" },
  { key: "otherDeductions", label: "Other" },
];

function n(v: unknown): number {
  return Number(v ?? 0) || 0;
}

// Inline editor for the "Drawn" amount on a founder's pay slip. Click to
// reveal the input, type the actual drawn figure, hit Save — the parent
// mutation updates the slip and refreshes the tab. Defaults to netSalary
// (= full draw); typing a lower number records the gap as deferred comp.
function DrawnAmountCell({
  slip,
  userId,
  editable,
}: {
  slip: PaySlip;
  userId: string;
  editable: boolean;
}) {
  const m = useSetDrawnAmount(slip.id, userId);
  const [editing, setEditing] = useState(false);
  const initial = slip.drawnAmount != null ? Number(slip.drawnAmount) : Number(slip.netSalary);
  const [value, setValue] = useState<string>(String(initial));

  if (!editable) {
    return (
      <span className="tabular-nums">
        {slip.drawnAmount != null ? formatCurrency(Number(slip.drawnAmount)) : "—"}
      </span>
    );
  }
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => { setValue(String(initial)); setEditing(true); }}
        className="text-left tabular-nums underline decoration-dotted underline-offset-2 hover:text-primary"
        title="Click to record what was actually drawn this month"
      >
        {slip.drawnAmount != null ? formatCurrency(Number(slip.drawnAmount)) : `${formatCurrency(Number(slip.netSalary))} (full)`}
      </button>
    );
  }
  const submit = () => {
    const v = Number(value);
    if (!Number.isFinite(v) || v < 0) return;
    m.mutate(v, { onSuccess: () => setEditing(false) });
  };
  return (
    <div className="flex items-center gap-1">
      <Input
        type="number"
        step="0.01"
        min={0}
        max={Number(slip.netSalary)}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") setEditing(false); }}
        className="h-7 w-24 px-2 text-xs tabular-nums"
        autoFocus
      />
      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={submit} disabled={m.isPending}>
        {m.isPending ? "…" : "Save"}
      </Button>
      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditing(false)}>
        Cancel
      </Button>
    </div>
  );
}

const LEDGER_KIND_LABELS: Record<string, string> = {
  LOAN_IN: "Loan to company",
  EXPENSE_REIMBURSEMENT: "Expense reimbursement",
  DISTRIBUTION: "Distribution / draw",
  REPAYMENT: "Repayment from company",
  OTHER: "Other",
};

// Lightweight dialog for HR to add a ledger entry. Pre-fills direction
// based on kind so HR doesn't have to think about the sign convention.
function AddLedgerEntryDialog({
  open,
  onOpenChange,
  userId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
}) {
  const m = useAddFounderLedgerEntry(userId);
  const [kind, setKind] = useState<"LOAN_IN" | "EXPENSE_REIMBURSEMENT" | "DISTRIBUTION" | "REPAYMENT" | "OTHER">("LOAN_IN");
  const [direction, setDirection] = useState<"CREDIT" | "DEBIT">("CREDIT");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");

  // Sane direction default per kind. User can still override (OTHER may
  // genuinely go either way; everything else has one natural sign).
  const onKindChange = (k: typeof kind) => {
    setKind(k);
    if (k === "LOAN_IN" || k === "EXPENSE_REIMBURSEMENT") setDirection("CREDIT");
    else if (k === "DISTRIBUTION" || k === "REPAYMENT") setDirection("DEBIT");
  };

  const submit = () => {
    const a = Number(amount);
    if (!Number.isFinite(a) || a <= 0) return;
    m.mutate(
      { date, direction, kind, amount: a, description: description || undefined, reference: reference || undefined },
      {
        onSuccess: () => {
          onOpenChange(false);
          setAmount(""); setDescription(""); setReference("");
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Add capital-account entry</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Kind</label>
            <Select
              value={kind}
              onValueChange={(v) => onKindChange(v as typeof kind)}
              options={Object.entries(LEDGER_KIND_LABELS).map(([value, label]) => ({ value, label }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Direction</label>
            <Select
              value={direction}
              onValueChange={(v) => setDirection(v as "CREDIT" | "DEBIT")}
              options={[
                { value: "CREDIT", label: "Credit — company owes founder (loan, reimbursement)" },
                { value: "DEBIT", label: "Debit — founder took / company repaid" },
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Date</label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Amount</label>
              <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Description</label>
            <TextArea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional context" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Reference (cheque #, txn id…)</label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={m.isPending || !amount}>{m.isPending ? "Saving…" : "Add entry"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CapitalAccountCard({ userId, canEdit }: { userId: string; canEdit: boolean }) {
  const q = useFounderCapital(userId);
  const del = useDeleteFounderLedgerEntry(userId);
  const [addOpen, setAddOpen] = useState(false);
  if (q.isLoading) return null;
  if (q.isError || !q.data) return null;
  const { balance, breakdown, entries } = q.data;

  return (
    <Card className="border-l-4 border-l-emerald-500">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">Capital Account</h3>
          <p className="text-xs text-slate-500">
            Running net: positive = company owes the founder; negative = founder owes the company.
          </p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={() => setAddOpen(true)}>Add entry</Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
          <div className="text-xs uppercase tracking-wider text-slate-400">Net balance</div>
          <div className={`mt-1 text-2xl font-bold tabular-nums ${balance >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            {balance >= 0 ? "+" : "−"}{formatCurrency(Math.abs(balance))}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
          <div className="text-xs uppercase tracking-wider text-slate-400">Deferred salary</div>
          <div className="mt-1 text-base font-semibold tabular-nums">{formatCurrency(breakdown.deferredFromSlips)}</div>
          <div className="text-[11px] text-slate-500">From pay slips</div>
        </div>
        <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
          <div className="text-xs uppercase tracking-wider text-slate-400">Credits</div>
          <div className="mt-1 text-base font-semibold tabular-nums text-emerald-700">{formatCurrency(breakdown.ledgerCredits)}</div>
          <div className="text-[11px] text-slate-500">Loans + reimbursements</div>
        </div>
        <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
          <div className="text-xs uppercase tracking-wider text-slate-400">Debits</div>
          <div className="mt-1 text-base font-semibold tabular-nums text-rose-700">{formatCurrency(breakdown.ledgerDebits)}</div>
          <div className="text-[11px] text-slate-500">Distributions + repayments</div>
        </div>
      </div>

      {entries.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 dark:border-slate-800">
              <tr className="text-left text-xs uppercase tracking-wider text-slate-400">
                <th className="py-2 pr-2">Date</th>
                <th className="py-2 pr-2">Kind</th>
                <th className="py-2 pr-2">Description</th>
                <th className="py-2 pr-2 text-right">Amount</th>
                {canEdit && <th className="py-2 pl-2 text-right" />}
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                  <td className="py-2 pr-2 tabular-nums">{new Date(e.date).toLocaleDateString()}</td>
                  <td className="py-2 pr-2">
                    <Badge tone={e.direction === "CREDIT" ? "positive" : "destructive"} size="sm">
                      {LEDGER_KIND_LABELS[e.kind] ?? e.kind}
                    </Badge>
                  </td>
                  <td className="py-2 pr-2 text-xs text-slate-600 dark:text-slate-400">
                    {e.description ?? "—"}
                    {e.reference && <span className="ml-1 text-slate-400">· ref {e.reference}</span>}
                  </td>
                  <td className={`py-2 pr-2 text-right tabular-nums font-medium ${e.direction === "CREDIT" ? "text-emerald-700" : "text-rose-700"}`}>
                    {e.direction === "CREDIT" ? "+" : "−"}{formatCurrency(Number(e.amount))}
                  </td>
                  {canEdit && (
                    <td className="py-2 pl-2 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-rose-600 hover:bg-rose-50"
                        disabled={del.isPending}
                        onClick={() => {
                          if (confirm("Delete this ledger entry?")) del.mutate(e.id);
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddLedgerEntryDialog open={addOpen} onOpenChange={setAddOpen} userId={userId} />
    </Card>
  );
}

export function PayrollTab({ userId }: { userId: string }) {
  const q = useEmployeePayroll(userId);
  const currentUser = useAuthStore((s) => s.user);
  const currentUserId = currentUser?.id;
  const isHr = (currentUser?.roles ?? []).some((r) =>
    ["SUPER_ADMIN", "ADMIN", "HR_MANAGER"].includes(r),
  );

  if (q.isLoading) return <LoadingState label="Loading payroll..." />;
  if (q.isError || !q.data) return <ErrorState label="Unable to load payroll data." />;

  const ss = q.data.salaryStructure as unknown as SalaryStructure | null;
  const slips = (q.data.paySlips ?? []) as unknown as PaySlip[];
  const isFounder = !!q.data.isFounder;
  const summary = q.data.founderSummary;
  // The founder themselves and HR can edit drawn amounts. A regular
  // employee viewing someone else's profile (rare — usually they can't)
  // shouldn't see the editor.
  const canEditDrawn = isFounder && (isHr || currentUserId === userId);

  const earningsTotal = ss ? EARNINGS.reduce((acc, e) => acc + n(ss[e.key]), 0) : 0;
  const deductionsTotal = ss ? DEDUCTIONS.reduce((acc, e) => acc + n(ss[e.key]), 0) : 0;
  const netTotal = earningsTotal - deductionsTotal;

  return (
    <div className="flex flex-col gap-4">
      {/* Capital account ledger — sits above the deferred-comp summary so
          HR sees the consolidated net first, then the deferred breakdown. */}
      {isFounder && <CapitalAccountCard userId={userId} canEdit={isHr} />}

      {/* Founder deferred-comp summary — only visible for founders. Tracks
          the running IOU from the company when the founder takes less
          than agreed in lean months. */}
      {isFounder && summary && (
        <Card className="border-l-4 border-l-indigo-500">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Deferred Compensation</h3>
              <p className="text-xs text-slate-500">
                Salary you've sacrificed and the company owes back. Updated automatically when you mark a drawn amount below.
              </p>
            </div>
            <Badge tone="info" size="sm">Founder</Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <div className="text-xs uppercase tracking-wider text-slate-400">Lifetime</div>
              <div className="mt-1 text-2xl font-bold tabular-nums">
                {formatCurrency(summary.lifetimeDeferred)}
              </div>
              <div className="text-[11px] text-slate-500">{summary.monthsSubsidised} month{summary.monthsSubsidised === 1 ? "" : "s"} subsidised</div>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <div className="text-xs uppercase tracking-wider text-slate-400">This year</div>
              <div className="mt-1 text-2xl font-bold tabular-nums">
                {formatCurrency(summary.ytdDeferred)}
              </div>
              <div className="text-[11px] text-slate-500">{new Date().getFullYear()}</div>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <div className="text-xs uppercase tracking-wider text-slate-400">Status</div>
              <div className="mt-1 text-sm">
                <Badge tone={summary.lifetimeDeferred > 0 ? "warning" : "positive"} size="sm">
                  {summary.lifetimeDeferred > 0 ? "IOU outstanding" : "Fully paid out"}
                </Badge>
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Reflects approved/processed slips only.
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Salary structure</h3>
          {ss?.effectiveFrom && (
            <span className="text-xs text-slate-500">
              Effective {new Date(ss.effectiveFrom).toLocaleDateString()}
            </span>
          )}
        </div>
        {ss ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-bold uppercase tracking-wider text-emerald-600">Earnings</div>
              <dl className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
                {EARNINGS.map((e) => (
                  <div key={e.key} className="flex items-center justify-between py-1.5">
                    <dt className="text-slate-600 dark:text-slate-400">{e.label}</dt>
                    <dd className="font-medium tabular-nums">{formatCurrency(n(ss[e.key]))}</dd>
                  </div>
                ))}
                <div className="flex items-center justify-between py-1.5 font-semibold">
                  <dt>Gross</dt>
                  <dd className="tabular-nums">{formatCurrency(earningsTotal)}</dd>
                </div>
              </dl>
            </div>
            <div>
              <div className="mb-1 text-xs font-bold uppercase tracking-wider text-rose-600">Deductions</div>
              <dl className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
                {DEDUCTIONS.map((e) => (
                  <div key={e.key} className="flex items-center justify-between py-1.5">
                    <dt className="text-slate-600 dark:text-slate-400">{e.label}</dt>
                    <dd className="font-medium tabular-nums">{formatCurrency(n(ss[e.key]))}</dd>
                  </div>
                ))}
                <div className="flex items-center justify-between py-1.5 font-semibold">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{formatCurrency(deductionsTotal)}</dd>
                </div>
              </dl>
              <div className="mt-3 rounded-xl bg-slate-100 px-3 py-2 dark:bg-slate-800">
                <div className="flex items-center justify-between font-semibold">
                  <span>Net</span>
                  <span className="tabular-nums">{formatCurrency(netTotal)}</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">No salary structure recorded.</p>
        )}
      </Card>

      <Card className="overflow-hidden p-0">
        <h3 className="px-5 pt-5 font-semibold">Pay slips</h3>
        {slips.length === 0 ? (
          <p className="px-5 py-3 text-sm text-slate-500">No pay slips.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 dark:border-slate-800">
              <tr className="text-left text-xs uppercase tracking-wider text-slate-400">
                <th className="px-4 py-2">Period</th>
                <th className="px-4 py-2">Days</th>
                <th className="px-4 py-2 text-right">Gross</th>
                <th className="px-4 py-2 text-right">Deductions</th>
                <th className="px-4 py-2 text-right">Net</th>
                {isFounder && <th className="px-4 py-2 text-right">Drawn</th>}
                {isFounder && <th className="px-4 py-2 text-right">Deferred</th>}
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {slips.map((s) => {
                const deductions = n(s.pfDeduction) + n(s.taxDeduction) + n(s.otherDeductions);
                const deferred = n(s.deferredAmount);
                return (
                  <tr key={s.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                    <td className="px-4 py-2">{MONTHS[s.month - 1] ?? s.month} {s.year}</td>
                    <td className="px-4 py-2 tabular-nums">
                      {s.paidDays}/{s.workingDays}
                      {s.leaveDays > 0 && <span className="ml-1 text-xs text-amber-600">· {s.leaveDays}L</span>}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(n(s.grossSalary))}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-rose-600">−{formatCurrency(deductions)}</td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums">{formatCurrency(n(s.netSalary))}</td>
                    {isFounder && (
                      <td className="px-4 py-2 text-right">
                        <DrawnAmountCell slip={s} userId={userId} editable={canEditDrawn} />
                      </td>
                    )}
                    {isFounder && (
                      <td className="px-4 py-2 text-right tabular-nums">
                        {deferred > 0 ? (
                          <span className="font-semibold text-indigo-600">
                            {formatCurrency(deferred)}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-2">
                      <Badge tone={s.status === "PAID" ? "positive" : "warning"} size="sm">{s.status}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
