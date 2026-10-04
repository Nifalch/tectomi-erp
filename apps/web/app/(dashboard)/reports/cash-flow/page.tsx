"use client";

import { ReportShell } from "@/components/reports/report-shell";
import { useReportRange } from "@/components/reports/date-range-bar";
import { Card } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useCashFlow } from "@/lib/api/hooks";
import { formatCurrency } from "@/lib/utils";
import { ChartCard, BarChart, CHART_COLORS } from "@/components/charts";

type Line = { name: string; amount: number };

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v ?? 0) || 0;
}

function readLines(data: any, ...keys: string[]): Line[] {
  for (const k of keys) {
    const v = data?.[k];
    if (Array.isArray(v)) {
      return v.map((l: any) => ({ name: l.name ?? l.category ?? "", amount: num(l.amount ?? l.total) }));
    }
    if (v && typeof v === "object" && Array.isArray(v.lines)) {
      return v.lines.map((l: any) => ({ name: l.name ?? "", amount: num(l.amount) }));
    }
  }
  return [];
}

function Section({ title, lines, net }: { title: string; lines: Line[]; net: number }) {
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
              <span className={`font-mono ${l.amount < 0 ? "text-red-600" : "text-emerald-600"}`}>
                {formatCurrency(l.amount)}
              </span>
            </li>
          ))
        )}
      </ul>
      <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm font-semibold">
        <span>Net {title}</span>
        <span className="font-mono">{formatCurrency(net)}</span>
      </div>
    </Card>
  );
}

export default function CashFlowPage() {
  const { from, to } = useReportRange();
  const query = useCashFlow(from, to);

  return (
    <ReportShell title="Cash Flow Statement" description={from && to ? `${from} → ${to}` : undefined}>
      {query.isLoading ? (
        <LoadingState label="Loading cash flow..." />
      ) : query.isError ? (
        <ErrorState label="Unable to load cash flow." />
      ) : (
        (() => {
          const data = query.data;
          const operating = readLines(data, "operating");
          const investing = readLines(data, "investing");
          const financing = readLines(data, "financing");
          const netOp = num(data?.netOperating ?? data?.operating?.total) || operating.reduce((s, l) => s + l.amount, 0);
          const netInv = num(data?.netInvesting ?? data?.investing?.total) || investing.reduce((s, l) => s + l.amount, 0);
          const netFin = num(data?.netFinancing ?? data?.financing?.total) || financing.reduce((s, l) => s + l.amount, 0);
          const opening = num(data?.openingBalance);
          const netChange = num(data?.netChange ?? netOp + netInv + netFin);
          const closing = num(data?.closingBalance ?? opening + netChange);

          return (
            <div className="flex flex-col gap-4">
              <ChartCard title="Cash Flow Summary" description="Net change by activity">
                <BarChart
                  data={[
                    { label: "Operating", value: netOp },
                    { label: "Investing", value: netInv },
                    { label: "Financing", value: netFin },
                    { label: "Net Change", value: netChange },
                  ]}
                  color={CHART_COLORS.primary}
                  height={220}
                  formatValue={(n) => formatCurrency(n)}
                />
              </ChartCard>
              <div className="grid gap-4 lg:grid-cols-3">
                <Section title="Operating" lines={operating} net={netOp} />
                <Section title="Investing" lines={investing} net={netInv} />
                <Section title="Financing" lines={financing} net={netFin} />
              </div>
              <Card className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Opening Balance</span>
                  <span className="font-mono">{formatCurrency(opening)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Net Change</span>
                  <span className={`font-mono ${netChange < 0 ? "text-red-600" : "text-emerald-600"}`}>
                    {formatCurrency(netChange)}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-2 text-base font-semibold">
                  <span>Closing Balance</span>
                  <span className="font-mono">{formatCurrency(closing)}</span>
                </div>
              </Card>
            </div>
          );
        })()
      )}
    </ReportShell>
  );
}
