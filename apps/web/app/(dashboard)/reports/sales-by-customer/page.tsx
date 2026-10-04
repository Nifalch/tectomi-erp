"use client";

import { ReportShell } from "@/components/reports/report-shell";
import { useReportRange } from "@/components/reports/date-range-bar";
import { DataTable } from "@/components/ui/data-table";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useSalesByCustomer } from "@/lib/api/hooks";
import { formatCurrency, toArray } from "@/lib/utils";
import { ChartCard, HorizontalBarChart, CHART_COLORS } from "@/components/charts";
import type { ColumnDef } from "@tanstack/react-table";

type Row = { client: string; invoiceCount: number; totalSales: number; totalPaid: number; outstanding: number };

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v ?? 0) || 0;
}

const cols: ColumnDef<Row, unknown>[] = [
  { accessorKey: "client", header: "Client", cell: ({ row }) => <span className="font-medium">{row.original.client}</span> },
  { accessorKey: "invoiceCount", header: "Invoices", cell: ({ row }) => <span className="font-mono">{row.original.invoiceCount}</span> },
  { accessorKey: "totalSales", header: "Total Sales", cell: ({ row }) => <span className="font-mono">{formatCurrency(row.original.totalSales)}</span> },
  { accessorKey: "totalPaid", header: "Total Paid", cell: ({ row }) => <span className="font-mono">{formatCurrency(row.original.totalPaid)}</span> },
  {
    accessorKey: "outstanding",
    header: "Outstanding",
    cell: ({ row }) => {
      const v = row.original.outstanding;
      return <span className={`font-mono ${v > 0 ? "text-red-600" : "text-slate-500"}`}>{formatCurrency(v)}</span>;
    },
  },
];

export default function SalesByCustomerPage() {
  const { from, to } = useReportRange();
  const query = useSalesByCustomer(from, to);

  return (
    <ReportShell title="Sales by Customer" description={from && to ? `${from} → ${to}` : undefined}>
      {query.isLoading ? (
        <LoadingState label="Loading sales by customer..." />
      ) : query.isError ? (
        <ErrorState label="Unable to load report." />
      ) : (
        (() => {
          const rowsSrc = toArray<any>(query.data?.rows ?? query.data?.customers ?? query.data);
          const rows: Row[] = rowsSrc
            .map((r) => ({
              client: r.client ?? r.clientName ?? r.name ?? "",
              invoiceCount: num(r.invoiceCount ?? r.count),
              totalSales: num(r.totalSales ?? r.total ?? r.sales),
              totalPaid: num(r.totalPaid ?? r.paid),
              outstanding: num(r.outstanding ?? r.balance ?? (num(r.totalSales ?? r.total) - num(r.totalPaid ?? r.paid))),
            }))
            .sort((a, b) => b.totalSales - a.totalSales);
          const topTen = rows.slice(0, 10).map((r) => ({ label: r.client.slice(0, 20) || "—", value: r.totalSales }));
          return (
            <div className="flex flex-col gap-4">
              <ChartCard title="Top 10 Clients by Sales">
                <HorizontalBarChart data={topTen} color={CHART_COLORS.primary} formatValue={(n) => formatCurrency(n)} />
              </ChartCard>
              <DataTable
                columns={cols}
                data={rows}
                searchPlaceholder="Search clients..."
                moduleColor="reports"
                emptyState={{ title: "No sales", description: "No sales activity in this period." }}
              />
            </div>
          );
        })()
      )}
    </ReportShell>
  );
}
