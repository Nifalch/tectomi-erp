"use client";

import { ReportShell } from "@/components/reports/report-shell";
import { useReportRange } from "@/components/reports/date-range-bar";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TH, TD } from "@/components/ui/table";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useTaxSummary } from "@/lib/api/hooks";
import { formatCurrency, toArray } from "@/lib/utils";
import { ChartCard, StackedBarChart, CHART_COLORS } from "@/components/charts";

type TaxRow = { name: string; rate: number; taxable: number; tax: number };

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v ?? 0) || 0;
}

function toRows(src: any): TaxRow[] {
  return toArray<any>(src).map((r) => ({
    name: r.name ?? r.taxName ?? r.rateName ?? "",
    rate: num(r.rate ?? r.percentage),
    taxable: num(r.taxable ?? r.taxableAmount),
    tax: num(r.tax ?? r.taxAmount ?? r.amount),
  }));
}

function TaxTable({ title, rows }: { title: string; rows: TaxRow[] }) {
  const totalTaxable = rows.reduce((s, r) => s + r.taxable, 0);
  const totalTax = rows.reduce((s, r) => s + r.tax, 0);
  return (
    <Card>
      <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">{title}</h3>
      <div className="mt-3 overflow-x-auto">
        <Table>
          <THead>
            <tr>
              <TH>Tax Rate</TH>
              <TH className="text-right">Rate %</TH>
              <TH className="text-right">Taxable Amount</TH>
              <TH className="text-right">Tax Amount</TH>
            </tr>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <tr>
                <TD colSpan={4} className="text-center text-slate-400">No data.</TD>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={i}>
                  <TD className="font-medium">{r.name}</TD>
                  <TD className="text-right font-mono">{r.rate.toFixed(2)}%</TD>
                  <TD className="text-right font-mono">{formatCurrency(r.taxable)}</TD>
                  <TD className="text-right font-mono">{formatCurrency(r.tax)}</TD>
                </tr>
              ))
            )}
            <tr className="border-t-2 border-border font-semibold">
              <TD colSpan={2}>Total</TD>
              <TD className="text-right font-mono">{formatCurrency(totalTaxable)}</TD>
              <TD className="text-right font-mono">{formatCurrency(totalTax)}</TD>
            </tr>
          </TBody>
        </Table>
      </div>
    </Card>
  );
}

export default function TaxSummaryPage() {
  const { from, to } = useReportRange();
  const query = useTaxSummary(from, to);

  return (
    <ReportShell title="Tax Summary" description={from && to ? `${from} → ${to}` : undefined}>
      {query.isLoading ? (
        <LoadingState label="Loading tax summary..." />
      ) : query.isError ? (
        <ErrorState label="Unable to load tax summary." />
      ) : (
        (() => {
          const data = query.data;
          const collected = toRows(data?.collected ?? data?.taxCollected ?? data?.sales);
          const paid = toRows(data?.paid ?? data?.taxPaid ?? data?.purchases);
          const totalCollected = num(data?.totalCollected) || collected.reduce((s, r) => s + r.tax, 0);
          const totalPaid = num(data?.totalPaid) || paid.reduce((s, r) => s + r.tax, 0);
          const netPayable = num(data?.netPayable ?? totalCollected - totalPaid);

          const rateNames = Array.from(new Set([...collected.map((r) => r.name), ...paid.map((r) => r.name)])).filter(Boolean);
          const chartData = rateNames.map((name) => ({
            label: name,
            Collected: collected.find((r) => r.name === name)?.tax ?? 0,
            Paid: paid.find((r) => r.name === name)?.tax ?? 0,
          }));
          return (
            <div className="flex flex-col gap-4">
              <ChartCard title="Collected vs Paid by Rate">
                <StackedBarChart
                  data={chartData as Array<Record<string, string | number>>}
                  keys={["Collected", "Paid"]}
                  colors={[CHART_COLORS.emerald, CHART_COLORS.red]}
                  height={240}
                  formatValue={(n) => formatCurrency(n)}
                />
              </ChartCard>
              <TaxTable title="Tax Collected (Sales)" rows={collected} />
              <TaxTable title="Tax Paid (Purchases)" rows={paid} />
              <Card
                className={
                  netPayable >= 0
                    ? "border-amber-500/50 bg-amber-500/10"
                    : "border-emerald-500/50 bg-emerald-500/10"
                }
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardDescription>Net {netPayable >= 0 ? "Tax Payable" : "Tax Refundable"}</CardDescription>
                    <CardTitle className="text-2xl">{formatCurrency(Math.abs(netPayable))}</CardTitle>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <div>Collected: <span className="font-mono">{formatCurrency(totalCollected)}</span></div>
                    <div>Paid: <span className="font-mono">{formatCurrency(totalPaid)}</span></div>
                  </div>
                </div>
              </Card>
            </div>
          );
        })()
      )}
    </ReportShell>
  );
}
