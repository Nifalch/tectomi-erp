"use client";

import { useRouter } from "next/navigation";
import { Plus, Eye, Pencil, CreditCard, XCircle, Trash2 } from "lucide-react";
import { ListPageLayout } from "@/components/layouts/list-page-layout";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useBills } from "@/lib/api/hooks";
import { useMarkBillOpen, useVoidBill, useDeleteBill } from "@/lib/api/mutations";
import { formatCurrency, toArray } from "@/lib/utils";
import { createActionsColumn, type RowAction } from "@/components/ui/data-table-row-actions";
import type { ColumnDef } from "@tanstack/react-table";

interface BillRow {
  id: string;
  billNumber: string;
  vendor: { name?: string; companyName?: string };
  issueDate: string;
  dueDate?: string;
  total: number;
  amountPaid?: number;
  status: string;
}

export default function BillsPage() {
  const router = useRouter();
  const query = useBills();
  const openMutation = useMarkBillOpen();
  const voidMutation = useVoidBill();
  const deleteMutation = useDeleteBill();

  if (query.isLoading) return <LoadingState label="Loading bills..." />;
  if (query.isError || !query.data) return <ErrorState label="Unable to load bills." />;

  const rows = toArray<BillRow>(query.data);

  const rowActions: RowAction<BillRow>[] = [
    { label: "View", icon: <Eye className="size-4" />, onClick: (r) => router.push(`/bills/${r.id}`) },
    { label: "Edit", icon: <Pencil className="size-4" />, onClick: (r) => router.push(`/bills/${r.id}/edit`) },
    { label: "Mark Open", icon: <CreditCard className="size-4" />, onClick: (r) => openMutation.mutate(r.id), separator: true },
    { label: "Void", icon: <XCircle className="size-4" />, onClick: (r) => voidMutation.mutate(r.id) },
    { label: "Delete", icon: <Trash2 className="size-4" />, onClick: (r) => { if (confirm(`Delete ${r.billNumber}?`)) deleteMutation.mutate(r.id); }, destructive: true, separator: true },
  ];

  const columns: ColumnDef<BillRow, unknown>[] = [
    { accessorKey: "billNumber", header: "Bill #", cell: ({ row }) => <span className="font-medium">{row.original.billNumber}</span> },
    { id: "vendor", header: "Vendor", cell: ({ row }) => row.original.vendor?.name ?? row.original.vendor?.companyName ?? "—" },
    { accessorKey: "issueDate", header: "Issue Date", cell: ({ row }) => row.original.issueDate ? new Date(row.original.issueDate).toLocaleDateString() : "—" },
    { accessorKey: "dueDate", header: "Due Date", cell: ({ row }) => row.original.dueDate ? new Date(row.original.dueDate).toLocaleDateString() : "—" },
    { accessorKey: "total", header: "Total", cell: ({ row }) => formatCurrency(Number(row.original.total) || 0) },
    { id: "paid", header: "Paid", cell: ({ row }) => formatCurrency(Number(row.original.amountPaid) || 0) },
    { id: "balance", header: "Balance", cell: ({ row }) => formatCurrency((Number(row.original.total) || 0) - (Number(row.original.amountPaid) || 0)) },
    { accessorKey: "status", header: "Status", cell: ({ row }) => (
      row.original.status === "OVERDUE"
        ? <Badge tone="destructive" size="sm" dot>OVERDUE</Badge>
        : <StatusBadge status={row.original.status} />
    )},
    createActionsColumn(rowActions),
  ];

  return (
    <ListPageLayout
      module="accounts"
      title="Bills"
      description="Vendor bills and supplier invoices to pay."
      primaryAction={{ label: "New Bill", icon: <Plus className="mr-1 size-4" />, onClick: () => router.push("/bills/new") }}
      counts={[
        { label: "open", value: rows.filter((r) => r.status === "OPEN").length, tone: "warning" },
        { label: "overdue", value: rows.filter((r) => r.status === "OVERDUE").length, tone: "destructive" },
        { label: "paid", value: rows.filter((r) => r.status === "PAID").length, tone: "positive" },
      ]}
    >
      <DataTable
        columns={columns}
        data={rows}
        searchPlaceholder="Search bills..."
        moduleColor="accounts"
        emptyState={{ title: "No bills yet", description: "Track vendor bills and payables." }}
      />
    </ListPageLayout>
  );
}
