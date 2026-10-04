"use client";

import { ReportShell } from "@/components/reports/report-shell";
import { useReportRange } from "@/components/reports/date-range-bar";
import { Card } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useProfitLoss } from "@/lib/api/hooks";
import { formatCurrency } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, Wallet, ReceiptText, Layers, TrendingUp } from "lucide-react";

type Line = { account?: string; name?: string; amount: number };

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v ?? 0) || 0;
}

function readLines(data: any, ...keys: string[]): Line[] {
  for (const k of keys) {
    const v = data?.[k];
    if (Array.isArray(v)) {
      return v.map((l: any) => ({ name: l.name ?? l.account ?? l.accountName ?? "", amount: num(l.amount ?? l.total ?? l.balance) }));
    }
    if (v && typeof v === "object") {
      const arr = Array.isArray(v.accounts) ? v.accounts : Array.isArray(v.lines) ? v.lines : null;
      if (arr) {
        return arr.map((l: any) => ({ name: l.name ?? l.account ?? "", amount: num(l.amount ?? l.total ?? l.balance) }));
      }
    }
  }
  return [];
}

function readTotal(data: any, ...keys: string[]): number {
  for (const k of keys) {
    const v = data?.[k];
    if (typeof v === "number") return v;
    if (v && typeof v === "object" && typeof v.total === "number") return v.total;
  }
  return 0;
}

export default function ProfitLossPage() {
  const { from, to } = useReportRange();
  const { data, isLoading, isError } = useProfitLoss(from, to);

  return (
    <ReportShell title="Profit & Loss" description={from && to ? `${from} → ${to}` : "Select a date range"}>
      {isLoading ? (
        <LoadingState label="Loading profit & loss..." />
      ) : isError ? (
        <ErrorState label="Unable to load P&L." />
      ) : (
        (() => {
          const incomeLines = readLines(data, "income", "revenue");
          const cogsLines = readLines(data, "cogs", "costOfGoodsSold");
          const expLines = readLines(data, "expenses");
          const totalIncome = readTotal(data, "totalIncome", "income") || incomeLines.reduce((s, l) => s + l.amount, 0);
          const totalCogs = readTotal(data, "totalCogs", "costOfGoodsSold", "cogs") || cogsLines.reduce((s, l) => s + l.amount, 0);
          const totalExp = readTotal(data, "totalExpenses", "expenses") || expLines.reduce((s, l) => s + l.amount, 0);
          const grossProfit = num(data?.grossProfit ?? totalIncome - totalCogs);
          const net = num(data?.netProfit ?? data?.netIncome ?? grossProfit - totalExp);
          const margin = totalIncome > 0 ? (net / totalIncome) * 100 : 0;
          const profitable = net >= 0;

          // Bar proportions for the flow visual — capped at 100%.
          // Showing the % of income that goes to COGS / Expenses /
          // remaining-as-profit reads better than absolute amounts.
          const totalOut = totalCogs + totalExp + Math.max(0, net);
          const pct = (n: number) => (totalOut > 0 ? (n / totalOut) * 100 : 0);

          return (
            <div className="flex flex-col gap-6">
              {/* ── Hero: the bottom-line number gets the spotlight ── */}
              <Card
                className={`relative overflow-hidden ${
                  profitable
                    ? "bg-gradient-to-br from-emerald-50 to-emerald-100/60 dark:from-emerald-950/40 dark:to-emerald-900/20"
                    : "bg-gradient-to-br from-rose-50 to-rose-100/60 dark:from-rose-950/40 dark:to-rose-900/20"
                }`}
              >
                <div className="flex flex-wrap items-end justify-between gap-6">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {profitable ? <ArrowUpRight className="size-3.5 text-emerald-600" /> : <ArrowDownRight className="size-3.5 text-rose-600" />}
                      Net {profitable ? "Profit" : "Loss"}
                    </div>
                    <div className="mt-2 flex items-baseline gap-3">
                      <span
                        className={`font-mono text-5xl font-bold tabular-nums tracking-tight ${
                          profitable ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"
                        }`}
                      >
                        {formatCurrency(Math.abs(net))}
                      </span>
                      {totalIncome > 0 && (
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            profitable
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                              : "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                          }`}
                        >
                          {profitable ? "+" : ""}{margin.toFixed(1)}% margin
                        </span>
                      )}
                    </div>
                    {from && to && (
                      <p className="mt-2 text-xs text-slate-500">
                        For period <span className="font-mono">{from}</span> → <span className="font-mono">{to}</span>
                      </p>
                    )}
                  </div>
                  <TrendingUp className={`size-16 opacity-10 ${profitable ? "text-emerald-700" : "text-rose-700"}`} />
                </div>

                {/* Flow bar — visualises where each rupee of revenue ends
                    up. COGS first, then Expenses, then remaining profit
                    (or, when loss-making, a red overrun marker). */}
                {totalOut > 0 && (
                  <div className="mt-6">
                    <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-200/60 dark:bg-slate-800/60">
                      {totalCogs > 0 && (
                        <div
                          className="h-full bg-amber-500"
                          style={{ width: `${pct(totalCogs)}%` }}
                          title={`COGS: ${formatCurrency(totalCogs)}`}
                        />
                      )}
                      {totalExp > 0 && (
                        <div
                          className="h-full bg-rose-500"
                          style={{ width: `${pct(totalExp)}%` }}
                          title={`Expenses: ${formatCurrency(totalExp)}`}
                        />
                      )}
                      {net > 0 && (
                        <div
                          className="h-full bg-emerald-500"
                          style={{ width: `${pct(net)}%` }}
                          title={`Profit: ${formatCurrency(net)}`}
                        />
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-4 text-[11px] text-slate-600 dark:text-slate-400">
                      {totalCogs > 0 && (
                        <div className="flex items-center gap-1.5">
                          <span className="inline-block size-2 rounded-full bg-amber-500" /> COGS
                        </div>
                      )}
                      {totalExp > 0 && (
                        <div className="flex items-center gap-1.5">
                          <span className="inline-block size-2 rounded-full bg-rose-500" /> Expenses
                        </div>
                      )}
                      {net > 0 && (
                        <div className="flex items-center gap-1.5">
                          <span className="inline-block size-2 rounded-full bg-emerald-500" /> Retained
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Card>

              {/* ── KPI strip ── */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KpiTile
                  label="Income"
                  value={formatCurrency(totalIncome)}
                  icon={<Wallet className="size-4" />}
                  tone="emerald"
                />
                {totalCogs > 0 && (
                  <KpiTile
                    label="Cost of Goods Sold"
                    value={formatCurrency(totalCogs)}
                    icon={<Layers className="size-4" />}
                    tone="amber"
                  />
                )}
                <KpiTile
                  label="Expenses"
                  value={formatCurrency(totalExp)}
                  icon={<ReceiptText className="size-4" />}
                  tone="rose"
                />
                <KpiTile
                  label={totalCogs > 0 ? "Gross Profit" : "Operating Profit"}
                  value={formatCurrency(totalCogs > 0 ? grossProfit : totalIncome - totalExp)}
                  icon={<TrendingUp className="size-4" />}
                  tone={profitable ? "emerald" : "rose"}
                />
              </div>

              {/* ── Detail statement ── */}
              <Card className="space-y-6">
                <div className="flex items-baseline justify-between border-b border-border pb-3">
                  <h2 className="text-base font-semibold">Statement of Operations</h2>
                  {from && to && (
                    <span className="text-xs text-slate-500">
                      <span className="font-mono">{from}</span> → <span className="font-mono">{to}</span>
                    </span>
                  )}
                </div>

                <SectionBlock title="Income" lines={incomeLines} total={totalIncome} tone="emerald" />
                {cogsLines.length > 0 && (
                  <>
                    <SectionBlock title="Cost of Goods Sold" lines={cogsLines} total={totalCogs} tone="amber" />
                    <SubtotalRow label="Gross Profit" value={grossProfit} emphasis="muted" />
                  </>
                )}
                <SectionBlock title="Operating Expenses" lines={expLines} total={totalExp} tone="rose" />

                <SubtotalRow
                  label={`Net ${profitable ? "Profit" : "Loss"}`}
                  value={Math.abs(net)}
                  emphasis={profitable ? "profit" : "loss"}
                />
              </Card>
            </div>
          );
        })()
      )}
    </ReportShell>
  );
}

function KpiTile({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: "emerald" | "amber" | "rose" | "slate";
}) {
  const toneClasses: Record<typeof tone, string> = {
    emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    rose: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
    slate: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  };
  return (
    <Card className="flex items-start gap-3">
      <div className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${toneClasses[tone]}`}>{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
        <div className="mt-0.5 font-mono text-lg font-bold tabular-nums">{value}</div>
      </div>
    </Card>
  );
}

function SectionBlock({
  title,
  lines,
  total,
  tone,
}: {
  title: string;
  lines: Line[];
  total: number;
  tone: "emerald" | "amber" | "rose";
}) {
  const dot: Record<typeof tone, string> = {
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
  };
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className={`inline-block size-2 rounded-full ${dot[tone]}`} />
        <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</h3>
      </div>
      {lines.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-400 dark:bg-slate-900/40">
          No entries for this period.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-border/60">
          {lines.map((l, i) => (
            <li
              key={i}
              className="flex items-center justify-between border-b border-border/60 px-3 py-2 text-sm last:border-b-0 hover:bg-slate-50/60 dark:hover:bg-slate-900/40"
            >
              <span className="text-slate-700 dark:text-slate-200">{l.name || "Unnamed"}</span>
              <span className="font-mono tabular-nums text-slate-700 dark:text-slate-200">{formatCurrency(l.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex items-center justify-between px-3 text-sm">
        <span className="font-medium text-slate-600 dark:text-slate-300">Total {title}</span>
        <span className="font-mono font-semibold tabular-nums">{formatCurrency(total)}</span>
      </div>
    </div>
  );
}

function SubtotalRow({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: number;
  emphasis: "muted" | "profit" | "loss";
}) {
  const styles: Record<typeof emphasis, string> = {
    muted: "border-border bg-slate-50 dark:bg-slate-800/60",
    profit:
      "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
    loss:
      "border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-200",
  };
  const text = emphasis === "muted" ? "text-base font-semibold" : "text-lg font-bold";
  return (
    <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${text} ${styles[emphasis]}`}>
      <span>{label}</span>
      <span className="font-mono tabular-nums">{formatCurrency(value)}</span>
    </div>
  );
}
