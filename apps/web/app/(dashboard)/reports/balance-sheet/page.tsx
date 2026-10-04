"use client";

import { ReportShell } from "@/components/reports/report-shell";
import { useReportRange } from "@/components/reports/date-range-bar";
import { Card } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useBalanceSheet } from "@/lib/api/hooks";
import { formatCurrency } from "@/lib/utils";
import { ChartCard, DonutChart, CHART_COLORS } from "@/components/charts";

type Line = { name: string; amount: number };

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v ?? 0) || 0;
}

function readLines(data: any, ...keys: string[]): Line[] {
  for (const k of keys) {
    const v = data?.[k];
    if (Array.isArray(v)) {
      return v.map((l: any) => ({ name: l.name ?? l.account ?? l.accountName ?? "", amount: num(l.amount ?? l.balance ?? l.total) }));
    }
    // API ships `{ accounts: [...], total }` per section (assets,
    // liabilities, equity). The earlier shape used `.lines` — we still
    // check it for back-compat in case any cached client hits an older
    // server, but `accounts` is the live key.
    if (v && typeof v === "object") {
      const arr = Array.isArray(v.accounts) ? v.accounts : Array.isArray(v.lines) ? v.lines : null;
      if (arr) {
        return arr.map((l: any) => ({ name: l.name ?? l.account ?? "", amount: num(l.amount ?? l.balance) }));
      }
    }
  }
  return [];
}

function readSectionTotal(data: any, key: string): number | null {
  const v = data?.[key];
  if (v && typeof v === "object" && typeof v.total === "number") return v.total;
  return null;
}

function SectionCard({ title, lines, total }: { title: string; lines: Line[]; total: number }) {
  return (
    <Card>
      <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">{title}</h3>
      <ul className="mt-3 divide-y divide-border/50">
        {lines.length === 0 ? (
          <li className="py-2 text-sm text-slate-400">No entries.</li>
        ) : (
          lines.map((l, i) => (
            <li key={i} className="flex items-center justify-between py-2 text-sm">
              <span>{l.name || "Unnamed"}</span>
              <span className="font-mono">{formatCurrency(l.amount)}</span>
            </li>
          ))
        )}
      </ul>
      <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm font-semibold">
        <span>Total {title}</span>
        <span className="font-mono">{formatCurrency(total)}</span>
      </div>
    </Card>
  );
}

export default function BalanceSheetPage() {
  const { from, to } = useReportRange();
  const query = useBalanceSheet(from, to);

  return (
    <ReportShell title="Balance Sheet" description={to ? `As of ${to}` : "Select a date"}>
      {query.isLoading ? (
        <LoadingState label="Loading balance sheet..." />
      ) : query.isError ? (
        <ErrorState label="Unable to load balance sheet." />
      ) : (
        (() => {
          const data = query.data;
          const assets = readLines(data, "assets");
          const liabilities = readLines(data, "liabilities");
          const equity = readLines(data, "equity");
          // API returns per-section totals under `data.assets.total` etc.
          // Fall back to summing the lines if the field is missing.
          const totalAssets = readSectionTotal(data, "assets") ?? assets.reduce((s, l) => s + l.amount, 0);
          const totalLiab = readSectionTotal(data, "liabilities") ?? liabilities.reduce((s, l) => s + l.amount, 0);
          const totalEq = readSectionTotal(data, "equity") ?? equity.reduce((s, l) => s + l.amount, 0);
          const balanced = Math.abs(totalAssets - (totalLiab + totalEq)) < 0.5;

          return (
            <div className="flex flex-col gap-4">
              <ChartCard title="Assets / Liabilities / Equity">
                <DonutChart
                  data={[
                    { label: "Assets", value: totalAssets, color: CHART_COLORS.emerald },
                    { label: "Liabilities", value: totalLiab, color: CHART_COLORS.red },
                    { label: "Equity", value: totalEq, color: CHART_COLORS.primary },
                  ]}
                  total={formatCurrency(totalAssets)}
                  totalLabel="assets"
                  height={240}
                  formatValue={(n) => formatCurrency(n)}
                />
              </ChartCard>
              <div className="grid gap-4 lg:grid-cols-3">
                <SectionCard title="Assets" lines={assets} total={totalAssets} />
                <SectionCard title="Liabilities" lines={liabilities} total={totalLiab} />
                <SectionCard title="Equity" lines={equity} total={totalEq} />
              </div>
              <Card
                className={
                  balanced
                    ? "border-emerald-500/50 bg-emerald-500/10"
                    : "border-red-500/60 bg-red-500/10"
                }
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold">
                  <span>Assets = Liabilities + Equity</span>
                  <span className="font-mono">
                    {formatCurrency(totalAssets)} {balanced ? "=" : "≠"} {formatCurrency(totalLiab + totalEq)}
                  </span>
                </div>
                {!balanced && (
                  <p className="mt-1 text-xs text-red-700 dark:text-red-300">
                    Mismatch of {formatCurrency(Math.abs(totalAssets - (totalLiab + totalEq)))}
                  </p>
                )}
              </Card>
            </div>
          );
        })()
      )}
    </ReportShell>
  );
}
