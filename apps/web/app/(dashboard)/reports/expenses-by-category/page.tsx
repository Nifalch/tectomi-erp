"use client";

import { ReportShell } from "@/components/reports/report-shell";
import { useReportRange } from "@/components/reports/date-range-bar";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TH, TD } from "@/components/ui/table";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useExpensesByCategory } from "@/lib/api/hooks";
import { formatCurrency, toArray } from "@/lib/utils";
import { ChartCard, DonutChart, HorizontalBarChart, CHART_COLORS } from "@/components/charts";

type Row = { category: string; count: number; total: number };

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v ?? 0) || 0;
}

export default function ExpensesByCategoryPage() {
  const { from, to } = useReportRange();
  const query = useExpensesByCategory(from, to);

  return (
    <ReportShell title="Expenses by Category" description={from && to ? `${from} → ${to}` : undefined}>
      {query.isLoading ? (
        <LoadingState label="Loading expenses..." />
      ) : query.isError ? (
        <ErrorState label="Unable to load expenses." />
      ) : (
        (() => {
          const rowsSrc = toArray<any>(query.data?.rows ?? query.data?.categories ?? query.data);
          const rows: Row[] = rowsSrc
            .map((r) => ({
              category: r.category ?? r.name ?? "",
              count: num(r.count ?? r.transactions),
              total: num(r.total ?? r.amount),
            }))
            .sort((a, b) => b.total - a.total);
          const grandTotal = rows.reduce((s, r) => s + r.total, 0);

          const chartData = rows.map((r) => ({ label: r.category || "—", value: r.total }));
          return (
            <div className="flex flex-col gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <ChartCard title="Category Breakdown">
                  <DonutChart data={chartData} total={formatCurrency(grandTotal)} totalLabel="total" height={260} formatValue={(n) => formatCurrency(n)} />
                </ChartCard>
                <ChartCard title="By Amount">
                  <HorizontalBarChart data={chartData.slice(0, 10)} color={CHART_COLORS.red} formatValue={(n) => formatCurrency(n)} />
                </ChartCard>
              </div>

              <Card>
                <div className="overflow-x-auto">
                  <Table>
                    <THead>
                      <tr>
                        <TH>Category</TH>
                        <TH className="text-right">Count</TH>
                        <TH className="text-right">Total</TH>
                        <TH className="text-right">% of Total</TH>
                      </tr>
                    </THead>
                    <TBody>
                      {rows.map((r, i) => (
                        <tr key={i}>
                          <TD className="font-medium">{r.category}</TD>
                          <TD className="text-right font-mono">{r.count}</TD>
                          <TD className="text-right font-mono">{formatCurrency(r.total)}</TD>
                          <TD className="text-right font-mono">
                            {grandTotal > 0 ? ((r.total / grandTotal) * 100).toFixed(1) : "0.0"}%
                          </TD>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-border font-semibold">
                        <TD>Total</TD>
                        <TD className="text-right font-mono">{rows.reduce((s, r) => s + r.count, 0)}</TD>
                        <TD className="text-right font-mono">{formatCurrency(grandTotal)}</TD>
                        <TD className="text-right font-mono">100%</TD>
                      </tr>
                    </TBody>
                  </Table>
                </div>
              </Card>
            </div>
          );
        })()
      )}
    </ReportShell>
  );
}
