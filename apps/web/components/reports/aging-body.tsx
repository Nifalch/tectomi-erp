"use client";

import type { useRouter } from "next/navigation";
import { ReportShell } from "@/components/reports/report-shell";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { formatCurrency, toArray } from "@/lib/utils";
import { ChartCard, HorizontalBarChart, CHART_COLORS } from "@/components/charts";
import type { ColumnDef } from "@tanstack/react-table";

type Bucket = "current" | "d1_30" | "d31_60" | "d61_90" | "d90_plus";
type InvoiceRow = {
  id: string;
  number: string;
  client: string;
  dueDate: string;
  daysOverdue: number;
  amount: number;
  bucket: Bucket;
};

const BUCKETS: Array<{ key: Bucket; label: string; tone: "positive" | "info" | "warning" | "destructive"; color: string }> = [
  { key: "current", label: "Current", tone: "positive", color: "bg-emerald-500/10 text-emerald-700" },
  { key: "d1_30", label: "1-30", tone: "info", color: "bg-blue-500/10 text-blue-700" },
  { key: "d31_60", label: "31-60", tone: "warning", color: "bg-amber-500/10 text-amber-700" },
  { key: "d61_90", label: "61-90", tone: "warning", color: "bg-orange-500/10 text-orange-700" },
  { key: "d90_plus", label: "90+", tone: "destructive", color: "bg-red-500/10 text-red-700" },
];

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v ?? 0) || 0;
}

function bucketFromDays(days: number): Bucket {
  if (days <= 0) return "current";
  if (days <= 30) return "d1_30";
  if (days <= 60) return "d31_60";
  if (days <= 90) return "d61_90";
  return "d90_plus";
}

type AgingQuery = {
  data?: { buckets?: Record<string, unknown>; invoices?: unknown; bills?: unknown; rows?: unknown; items?: unknown };
  isLoading: boolean;
  isError: boolean;
};

export function AgingBody({
  title,
  entity,
  query,
  router,
}: {
  title: string;
  entity: "invoice" | "bill";
  query: AgingQuery;
  router: ReturnType<typeof useRouter>;
}) {
  const bucketsData = (query.data?.buckets ?? {}) as Record<string, unknown>;
  const bucketTotals: Record<Bucket, number> = {
    current: num(bucketsData.current),
    d1_30: num(bucketsData["1-30"] ?? bucketsData.d1_30),
    d31_60: num(bucketsData["31-60"] ?? bucketsData.d31_60),
    d61_90: num(bucketsData["61-90"] ?? bucketsData.d61_90),
    d90_plus: num(bucketsData["90+"] ?? bucketsData.d90_plus),
  };

  const rowsSrc = toArray<any>(query.data?.invoices ?? query.data?.bills ?? query.data?.rows ?? query.data?.items);
  const rows: InvoiceRow[] = rowsSrc.map((r) => {
    const days = num(r.daysOverdue ?? r.days);
    return {
      id: String(r.id ?? ""),
      number: r.number ?? r.invoiceNumber ?? r.billNumber ?? "",
      client: r.client ?? r.clientName ?? r.vendor ?? r.vendorName ?? "",
      dueDate: r.dueDate ?? "",
      daysOverdue: days,
      amount: num(r.amount ?? r.balance ?? r.outstanding),
      bucket: bucketFromDays(days),
    };
  });

  const cols: ColumnDef<InvoiceRow, unknown>[] = [
    { accessorKey: "number", header: entity === "invoice" ? "Invoice #" : "Bill #", cell: ({ row }) => <span className="font-mono text-xs">{row.original.number}</span> },
    { accessorKey: "client", header: entity === "invoice" ? "Client" : "Vendor", cell: ({ row }) => <span className="font-medium">{row.original.client}</span> },
    { accessorKey: "dueDate", header: "Due Date" },
    {
      accessorKey: "daysOverdue",
      header: "Days Overdue",
      cell: ({ row }) => {
        const b = BUCKETS.find((x) => x.key === row.original.bucket)!;
        return <Badge tone={b.tone} size="sm">{row.original.daysOverdue > 0 ? `${row.original.daysOverdue}d` : "Current"}</Badge>;
      },
    },
    { accessorKey: "amount", header: "Amount", cell: ({ row }) => <span className="font-mono">{formatCurrency(row.original.amount)}</span> },
  ];

  return (
    <ReportShell title={title}>
      {query.isLoading ? (
        <LoadingState label="Loading aging..." />
      ) : query.isError ? (
        <ErrorState label="Unable to load aging report." />
      ) : (
        <div className="flex flex-col gap-6">
          <ChartCard title="Aging Buckets" description="Outstanding balance by age">
            <HorizontalBarChart
              data={BUCKETS.map((b) => ({ label: b.label, value: bucketTotals[b.key] }))}
              color={CHART_COLORS.red}
              formatValue={(n) => formatCurrency(n)}
            />
          </ChartCard>
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {BUCKETS.map((b) => (
              <Card key={b.key} className={b.color}>
                <CardDescription className="text-current opacity-80">{b.label}</CardDescription>
                <CardTitle className="mt-2 text-xl">{formatCurrency(bucketTotals[b.key])}</CardTitle>
              </Card>
            ))}
          </div>

          <DataTable
            columns={cols}
            data={rows}
            searchPlaceholder={`Search ${entity}s...`}
            moduleColor="reports"
            onRowClick={(r) => {
              if (r.id) router.push(entity === "invoice" ? `/invoices/${r.id}` : `/finance/bills/${r.id}`);
            }}
            emptyState={{ title: "Nothing outstanding", description: "No unpaid items for this period." }}
          />
        </div>
      )}
    </ReportShell>
  );
}
