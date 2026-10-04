"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, RefreshCw, Star, Check, ArrowRight, HelpCircle } from "lucide-react";
import { ModuleHeader } from "@/components/layout/module-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { NumberInput } from "@/components/ui/number-input";
import { Table, THead, TBody, TH, TD } from "@/components/ui/table";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useMainAccount } from "@/lib/api/hooks";
import { useCreateBankAccount, useFinanceBackfill, useSetPrimaryBank } from "@/lib/api/mutations";
import { formatCurrency } from "@/lib/utils";

const SOURCE_LABELS: Record<string, string> = {
  PAYMENT: "Payment",
  PAY_SLIP: "Payroll",
  FOUNDER_LEDGER: "Founder ledger",
  MANUAL: "Manual",
  OPENING_BALANCE: "Opening",
};

const SOURCE_TONES: Record<string, "positive" | "warning" | "info" | "neutral" | "destructive"> = {
  PAYMENT: "positive",
  PAY_SLIP: "warning",
  FOUNDER_LEDGER: "info",
  MANUAL: "neutral",
  OPENING_BALANCE: "neutral",
};

export default function MainAccountPage() {
  const q = useMainAccount();
  const backfill = useFinanceBackfill();
  const setPrimary = useSetPrimaryBank();
  const [addBankOpen, setAddBankOpen] = useState(false);

  if (q.isLoading) return <LoadingState label="Loading main account…" />;
  if (q.isError || !q.data) return <ErrorState label="Unable to load main account." />;

  const {
    primaryBank, banks, mainBalance, glBalance, reconciled, monthToDate,
    profitLoss, byType, founders, recentEntries, recentBankTransactions,
  } = q.data;
  // Founder payables — what the company owes its co-founders. Positive
  // founder.net means the founder is owed (company is in debt to them);
  // negative means the founder has been over-paid / owes the company.
  const founderPayableTotal = founders.reduce((acc, f) => acc + Math.max(0, f.net), 0);
  const founderReceivableTotal = founders.reduce((acc, f) => acc + Math.max(0, -f.net), 0);

  // 3-step setup checklist drives the empty-state UX. Each step is "done"
  // when its corresponding side-effect is visible in the dashboard data.
  const setupSteps = [
    { label: "Create a bank account", done: banks.length > 0, href: "/bank-accounts", action: () => setAddBankOpen(true) },
    { label: "Designate a primary bank", done: !!primaryBank, href: null, action: null },
    { label: "Post historical transactions (Rebuild)", done: recentEntries.length > 0, href: null, action: () => backfill.mutate() },
  ];
  const setupIncomplete = setupSteps.some((s) => !s.done);

  return (
    <div className="flex flex-col gap-5">
      <ModuleHeader
        module="accounts"
        title="Main Account"
        description="Every invoice paid, salary released, expense, and founder transaction posts here automatically. One source of truth for cash."
        primaryAction={{
          label: backfill.isPending ? "Rebuilding…" : "Rebuild from existing data",
          icon: <RefreshCw className="mr-1 size-4" />,
          onClick: () => backfill.mutate(),
        }}
      />

      {/* Setup checklist — visible until all three steps are done. Walks
          HR through the one-time configuration without leaving the page. */}
      {setupIncomplete && (
        <Card className="border-l-4 border-l-amber-500">
          <CardTitle className="text-base">Finish setup</CardTitle>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Three steps to start tracking cash automatically. Once done, every paid invoice, salary release, expense, and founder transaction posts here on its own.
          </p>
          <ol className="mt-3 space-y-2">
            {setupSteps.map((s, i) => (
              <li
                key={i}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                  s.done
                    ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20"
                    : "border-slate-200 dark:border-slate-800"
                }`}
              >
                <span
                  className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    s.done
                      ? "bg-emerald-500 text-white"
                      : "bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                  }`}
                >
                  {s.done ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span className={`flex-1 text-sm ${s.done ? "line-through text-slate-500" : "font-medium"}`}>
                  {s.label}
                </span>
                {!s.done && s.action && (
                  <Button size="sm" onClick={s.action} disabled={backfill.isPending}>
                    {s.label.includes("Rebuild") ? (backfill.isPending ? "Running…" : "Run now") : "Do it"}
                  </Button>
                )}
                {!s.done && !s.action && i === 1 && banks.length > 0 && (
                  <span className="text-xs text-slate-500">Pick one below ↓</span>
                )}
              </li>
            ))}
          </ol>
        </Card>
      )}

      {/* Primary bank picker — shown until HR designates one */}
      {!primaryBank && banks.length > 0 && (
        <Card className="border-l-4 border-l-indigo-500">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Designate your main account</CardTitle>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Pick one bank as primary. All auto-posted transactions reference it as the cash side.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {banks.map((b) => (
                <Button
                  key={b.id}
                  size="sm"
                  variant="secondary"
                  disabled={setPrimary.isPending}
                  onClick={() => setPrimary.mutate(b.id)}
                >
                  <Star className="mr-1 size-3.5" />
                  {b.name}
                </Button>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Reconciliation banner — shows when the bank's live balance and
          the GL-derived total disagree (typically means the backfill
          hasn't been run after some historical data was imported). */}
      {!reconciled && (mainBalance !== 0 || glBalance !== 0) && (
        <Card className="border-l-4 border-l-amber-500">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm">
              <span className="font-semibold">Bank vs ledger out of sync</span>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Bank-side balance is <span className="font-mono">{formatCurrency(mainBalance)}</span>;
                GL-derived total is <span className="font-mono">{formatCurrency(glBalance)}</span>.
                Run <span className="font-semibold">Rebuild from existing data</span> to reconcile.
              </p>
            </div>
            <Button size="sm" onClick={() => backfill.mutate()} disabled={backfill.isPending}>
              <RefreshCw className="mr-1 size-3.5" />
              {backfill.isPending ? "Rebuilding…" : "Reconcile now"}
            </Button>
          </div>
        </Card>
      )}

      {/* Top KPIs */}
      <section className="grid gap-4 md:grid-cols-4">
        <Card className="border-l-4 border-l-indigo-500">
          <div className="text-xs uppercase tracking-wider text-slate-400">Main account balance</div>
          <div className={`mt-1 text-3xl font-bold tabular-nums ${mainBalance >= 0 ? "text-slate-900 dark:text-white" : "text-rose-600"}`}>
            {mainBalance < 0 ? "−" : ""}{formatCurrency(Math.abs(mainBalance))}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {primaryBank ? `${primaryBank.name}${primaryBank.bankName ? ` · ${primaryBank.bankName}` : ""}` : "No primary bank set"}
          </div>
          {primaryBank && (
            <div className="mt-1 text-[11px] text-slate-400">
              Opening {formatCurrency(primaryBank.openingBalance)} · since: {formatCurrency(primaryBank.currentBalance)}
            </div>
          )}
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <div className="text-xs uppercase tracking-wider text-slate-400">Inflow · this month</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-600">+{formatCurrency(monthToDate.inflow)}</div>
          <div className="text-xs text-slate-500">Invoices paid, founder loans in</div>
        </Card>
        <Card className="border-l-4 border-l-rose-500">
          <div className="text-xs uppercase tracking-wider text-slate-400">Outflow · this month</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-rose-600">−{formatCurrency(monthToDate.outflow)}</div>
          <div className="text-xs text-slate-500">Payroll, bills, distributions</div>
        </Card>
        <Card className="border-l-4 border-l-slate-400">
          <div className="text-xs uppercase tracking-wider text-slate-400">Net · this month</div>
          <div className={`mt-1 text-2xl font-bold tabular-nums ${monthToDate.net >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            {monthToDate.net >= 0 ? "+" : "−"}{formatCurrency(Math.abs(monthToDate.net))}
          </div>
          <div className="text-xs text-slate-500">Cashflow MTD</div>
        </Card>
      </section>

      {/* Profit & Loss summary — derived from the GL income vs expense
          accounts. Lifetime + month-to-date. */}
      <Card className={`border-l-4 ${profitLoss.lifetimeNet >= 0 ? "border-l-emerald-500" : "border-l-rose-500"}`}>
        <div className="mb-2 flex items-center justify-between">
          <CardTitle>Profit &amp; Loss</CardTitle>
          <span className="text-xs text-slate-500">
            Cash-basis · derived from journal entries
          </span>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-400">Lifetime</div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <div>
                <div className="text-[11px] text-slate-500">Revenue</div>
                <div className="text-base font-semibold tabular-nums text-emerald-700">
                  {formatCurrency(profitLoss.lifetimeIncome)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Expense</div>
                <div className="text-base font-semibold tabular-nums text-rose-700">
                  {formatCurrency(profitLoss.lifetimeExpense)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Net</div>
                <div
                  className={`text-base font-bold tabular-nums ${
                    profitLoss.lifetimeNet >= 0 ? "text-emerald-700" : "text-rose-700"
                  }`}
                >
                  {profitLoss.lifetimeNet >= 0 ? "+" : "−"}
                  {formatCurrency(Math.abs(profitLoss.lifetimeNet))}
                </div>
              </div>
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-400">This month</div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <div>
                <div className="text-[11px] text-slate-500">Revenue</div>
                <div className="text-base font-semibold tabular-nums text-emerald-700">
                  {formatCurrency(profitLoss.mtdIncome)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Expense</div>
                <div className="text-base font-semibold tabular-nums text-rose-700">
                  {formatCurrency(profitLoss.mtdExpense)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Net</div>
                <div
                  className={`text-base font-bold tabular-nums ${
                    profitLoss.mtdNet >= 0 ? "text-emerald-700" : "text-rose-700"
                  }`}
                >
                  {profitLoss.mtdNet >= 0 ? "+" : "−"}
                  {formatCurrency(Math.abs(profitLoss.mtdNet))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Balance-sheet style snapshot by account type. */}
      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <div className="text-xs uppercase tracking-wider text-slate-400">Assets</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{formatCurrency(byType.ASSET ?? 0)}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wider text-slate-400">Liabilities</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{formatCurrency(byType.LIABILITY ?? 0)}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wider text-slate-400">Equity</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{formatCurrency(byType.EQUITY ?? 0)}</div>
        </Card>
      </section>

      {/* Founder sub-accounts — framed as a LIABILITY (what the company
          owes its co-founders) since the most common driver is salary
          compromise + cash loans into the company. */}
      {founders.length > 0 && (
        <Card className="border-l-4 border-l-amber-500">
          <div className="mb-1 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle>Payable to co-founders</CardTitle>
              <Badge tone="warning" size="sm">Liability</Badge>
            </div>
            <Link href="/founders" className="text-xs text-primary hover:underline">View detail →</Link>
          </div>
          <p className="mb-3 text-xs text-slate-500">
            What the company owes each co-founder — accumulates from deferred salary on their pay
            slips and any cash they've put into the company, reduced by any draws / repayments.
            This shows up on the GL as <span className="font-mono">Founder Capital Account</span>{" "}
            (a long-term liability) after you run the backfill.
          </p>

          {/* Roll-up row: company-wide payable + receivable totals */}
          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-800 dark:bg-amber-950/20">
              <div className="text-xs uppercase tracking-wider text-amber-700 dark:text-amber-300">
                Company owes founders
              </div>
              <div className="mt-1 text-xl font-bold tabular-nums text-amber-700 dark:text-amber-300">
                {formatCurrency(founderPayableTotal)}
              </div>
              <div className="text-[11px] text-slate-500">Pay back when there's cash on hand.</div>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <div className="text-xs uppercase tracking-wider text-slate-500">
                Founders owe company
              </div>
              <div className={`mt-1 text-xl font-bold tabular-nums ${founderReceivableTotal > 0 ? "text-rose-600" : "text-slate-400"}`}>
                {formatCurrency(founderReceivableTotal)}
              </div>
              <div className="text-[11px] text-slate-500">From over-distributions, if any.</div>
            </div>
          </div>

          <Table>
            <THead>
              <tr>
                <TH>Founder</TH>
                <TH className="text-right">Amount owed</TH>
                <TH>What it means</TH>
              </tr>
            </THead>
            <TBody>
              {founders.map((f) => (
                <tr key={f.userId}>
                  <TD>
                    <Link href={`/hr/employees/${f.userId}`} className="font-medium hover:underline">
                      {f.name}
                    </Link>
                  </TD>
                  <TD className="text-right">
                    <span
                      className={`tabular-nums font-semibold ${
                        f.net > 0
                          ? "text-amber-700 dark:text-amber-300"
                          : f.net < 0
                            ? "text-rose-600"
                            : "text-slate-400"
                      }`}
                    >
                      {f.net === 0 ? formatCurrency(0) : f.net > 0
                        ? `+${formatCurrency(f.net)}`
                        : `−${formatCurrency(Math.abs(f.net))}`}
                    </span>
                  </TD>
                  <TD className="text-xs text-slate-500">
                    {f.net > 0
                      ? "Company will pay this when cash is available."
                      : f.net < 0
                        ? "Founder over-drew — owes the company."
                        : "Even — nothing outstanding."}
                  </TD>
                </tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      {/* Banks list with promote-to-primary */}
      {banks.length > 0 && (
        <Card>
          <CardTitle>Bank accounts</CardTitle>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {banks.map((b) => (
              <div
                key={b.id}
                className={`rounded-xl border p-3 ${
                  b.isPrimary
                    ? "border-indigo-300 bg-indigo-50/40 dark:border-indigo-700 dark:bg-indigo-950/20"
                    : "border-slate-200 dark:border-slate-800"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium">{b.name}</div>
                  {b.isPrimary ? (
                    <Badge tone="info" size="sm" dot>Primary</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={setPrimary.isPending}
                      onClick={() => setPrimary.mutate(b.id)}
                    >
                      Make primary
                    </Button>
                  )}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {b.bankName ?? b.type}{b.accountNumber ? ` · ${b.accountNumber.slice(-4).padStart(b.accountNumber.length, "•")}` : ""}
                </div>
                <div className="mt-2 text-lg font-semibold tabular-nums">
                  {formatCurrency(b.liveBalance)}
                </div>
                <div className="text-[11px] text-slate-400">
                  Opening {formatCurrency(b.openingBalance)} · activity {b.currentBalance >= 0 ? "+" : "−"}{formatCurrency(Math.abs(b.currentBalance))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Recent bank transactions — the easier-to-read flow log. Includes
          everything that moved cash on any active bank (Payment-driven,
          payroll mirrors, founder-ledger mirrors). */}
      {recentBankTransactions.length > 0 && (
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <CardTitle>Recent bank transactions</CardTitle>
            <Link href="/bank-accounts" className="text-xs text-primary hover:underline">Open bank accounts →</Link>
          </div>
          <Table>
            <THead>
              <tr>
                <TH>Date</TH>
                <TH>Bank</TH>
                <TH>Description</TH>
                <TH className="text-right">Amount</TH>
                <TH>Type</TH>
              </tr>
            </THead>
            <TBody>
              {recentBankTransactions.map((t) => (
                <tr key={t.id}>
                  <TD>{new Date(t.date).toLocaleDateString()}</TD>
                  <TD>
                    <span className="font-medium">{t.bank.name}</span>
                    {t.bank.isPrimary && <Badge tone="info" size="sm" className="ml-1">Primary</Badge>}
                  </TD>
                  <TD>
                    <div>{t.description}</div>
                    {t.reference && <div className="text-xs text-slate-500">ref {t.reference}</div>}
                  </TD>
                  <TD className="text-right">
                    <span className={`tabular-nums font-semibold ${t.type === "CREDIT" ? "text-emerald-600" : "text-rose-600"}`}>
                      {t.type === "CREDIT" ? "+" : "−"}{formatCurrency(t.amount)}
                    </span>
                  </TD>
                  <TD>
                    <Badge tone={t.type === "CREDIT" ? "positive" : "destructive"} size="sm">
                      {t.type === "CREDIT" ? "Inflow" : "Outflow"}
                    </Badge>
                  </TD>
                </tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      {/* Recent journal entries */}
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <CardTitle>Recent journal entries</CardTitle>
          <Link href="/journal-entries" className="text-xs text-primary hover:underline">Open ledger →</Link>
        </div>
        <Table>
          <THead>
            <tr>
              <TH>Date</TH>
              <TH>Description</TH>
              <TH>Source</TH>
              <TH className="text-right">Amount</TH>
              <TH>Lines</TH>
            </tr>
          </THead>
          <TBody>
            {recentEntries.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-sm text-slate-400">
                  No journal entries yet. Click <span className="font-semibold">Rebuild from existing data</span> if you have historical payments / payslips / founder entries.
                </td>
              </tr>
            ) : (
              recentEntries.map((e) => (
                <tr key={e.id}>
                  <TD>{new Date(e.date).toLocaleDateString()}</TD>
                  <TD>
                    <div className="font-medium">{e.description}</div>
                    <div className="text-xs text-slate-500">
                      {e.journalNumber}
                      {e.reference ? ` · ref ${e.reference}` : ""}
                    </div>
                  </TD>
                  <TD>
                    <Badge tone={SOURCE_TONES[e.source] ?? "neutral"} size="sm">
                      {SOURCE_LABELS[e.source] ?? e.source}
                    </Badge>
                  </TD>
                  <TD className="text-right tabular-nums font-semibold">{formatCurrency(e.amount)}</TD>
                  <TD>
                    <div className="text-xs text-slate-500">
                      {e.lines.map((l, i) => (
                        <div key={i}>
                          <span className="font-mono">{l.accountCode}</span> {l.accountName}{" "}
                          {l.debit > 0
                            ? <span className="text-rose-600">−{formatCurrency(l.debit)}</span>
                            : <span className="text-emerald-600">+{formatCurrency(l.credit)}</span>}
                        </div>
                      ))}
                    </div>
                  </TD>
                </tr>
              ))
            )}
          </TBody>
        </Table>
      </Card>

      <AddBankDialog open={addBankOpen} onOpenChange={setAddBankOpen} />
    </div>
  );
}

function AddBankDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const m = useCreateBankAccount();
  const setPrimary = useSetPrimaryBank();
  const [name, setName] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [type, setType] = useState("BANK");
  const [openingBalance, setOpeningBalance] = useState<number | null>(0);
  const [makePrimary, setMakePrimary] = useState(true);

  const submit = () => {
    if (!name.trim()) return;
    m.mutate(
      {
        name: name.trim(),
        type,
        bankName: bankName.trim() || undefined,
        accountNumber: accountNumber.trim() || undefined,
        openingBalance: openingBalance ?? 0,
        currency: "INR",
        isActive: true,
      },
      {
        onSuccess: (created) => {
          // Optionally flag it primary in the same flow — most common case.
          if (makePrimary && (created as { id?: string })?.id) {
            setPrimary.mutate((created as { id: string }).id);
          }
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Add bank account</DialogTitle></DialogHeader>
        <p className="text-xs text-slate-500">
          Every auto-posted journal entry routes through your primary bank as the cash side. Tick the box below to mark this one primary on creation.
        </p>
        <div className="mt-3 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Account label *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Main Operating · HDFC" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Bank name</label>
              <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="HDFC / ICICI / SBI…" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Account number</label>
              <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="last 4 OK" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Type</label>
              <Select
                value={type}
                onValueChange={setType}
                options={[
                  { value: "BANK", label: "Bank" },
                  { value: "CASH", label: "Cash" },
                  { value: "CREDIT_CARD", label: "Credit card" },
                  { value: "OTHER", label: "Other" },
                ]}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Opening balance (₹)</label>
              <NumberInput value={openingBalance} onChange={setOpeningBalance} placeholder="0" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={makePrimary}
              onChange={(e) => setMakePrimary(e.target.checked)}
              className="size-4 rounded border-slate-300"
            />
            <span>Make this the primary operating account</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={m.isPending || !name.trim()}>
            {m.isPending ? "Saving…" : "Add bank"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
