"use client";

import { useRouter } from "next/navigation";
import { Plus, Eye, Pencil, FileCheck2, Send, CheckCircle2, XCircle, Trash2 } from "lucide-react";
import { ListPageLayout } from "@/components/layouts/list-page-layout";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useEstimates } from "@/lib/api/hooks";
import {
  useConvertEstimateToInvoice,
  useSendEstimate,
  useAcceptEstimate,
  useDeclineEstimate,
  useDeleteEstimate,
} from "@/lib/api/mutations";
import { formatCurrency, toArray } from "@/lib/utils";
import { createActionsColumn, type RowAction } from "@/components/ui/data-table-row-actions";
import type { ColumnDef } from "@tanstack/react-table";

interface EstimateRow {
  id: string;
  estimateNumber: string;
  client: { companyName: string };
  issueDate: string;
  expiryDate?: string;
  total: number;
  status: string;
}

export default function EstimatesPage() {
  const router = useRouter();
  const query = useEstimates();
  const convertMutation = useConvertEstimateToInvoice();
  const sendMutation = useSendEstimate();
  const acceptMutation = useAcceptEstimate();
  const declineMutation = useDeclineEstimate();
  const deleteMutation = useDeleteEstimate();

  if (query.isLoading) return <LoadingState label="Loading estimates..." />;
  if (query.isError || !query.data) return <ErrorState label="Unable to load estimates." />;

  const rows = toArray<EstimateRow>(query.data);

  const rowActions: RowAction<EstimateRow>[] = [
    { label: "View", icon: <Eye className="size-4" />, onClick: (r) => router.push(`/estimates/${r.id}`) },
    { label: "Edit", icon: <Pencil className="size-4" />, onClick: (r) => router.push(`/estimates/${r.id}/edit`) },
    { label: "Convert to Invoice", icon: <FileCheck2 className="size-4" />, onClick: (r) => convertMutation.mutate(r.id), separator: true },
    { label: "Send", icon: <Send className="size-4" />, onClick: (r) => sendMutation.mutate(r.id) },
    { label: "Accept", icon: <CheckCircle2 className="size-4" />, onClick: (r) => acceptMutation.mutate(r.id) },
    { label: "Decline", icon: <XCircle className="size-4" />, onClick: (r) => declineMutation.mutate(r.id) },
    { label: "Delete", icon: <Trash2 className="size-4" />, onClick: (r) => { if (confirm(`Delete ${r.estimateNumber}?`)) deleteMutation.mutate(r.id); }, destructive: true, separator: true },
  ];

  const columns: ColumnDef<EstimateRow, unknown>[] = [
    { accessorKey: "estimateNumber", header: "Estimate #", cell: ({ row }) => <span className="font-medium">{row.original.estimateNumber}</span> },
    { id: "client", header: "Client", cell: ({ row }) => row.original.client?.companyName ?? "—" },
    { accessorKey: "issueDate", header: "Issue Date", cell: ({ row }) => row.original.issueDate ? new Date(row.original.issueDate).toLocaleDateString() : "—" },
    { accessorKey: "expiryDate", header: "Expiry", cell: ({ row }) => row.original.expiryDate ? new Date(row.original.expiryDate).toLocaleDateString() : "—" },
    { accessorKey: "total", header: "Total", cell: ({ row }) => formatCurrency(Number(row.original.total) || 0) },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    createActionsColumn(rowActions),
  ];

  return (
    <ListPageLayout
      module="proposals"
      title="Estimates"
      description="Draft quotes and convert accepted estimates into invoices."
      primaryAction={{ label: "New Estimate", icon: <Plus className="mr-1 size-4" />, onClick: () => router.push("/estimates/new") }}
      counts={[
        { label: "draft", value: rows.filter((r) => r.status === "DRAFT").length },
        { label: "sent", value: rows.filter((r) => r.status === "SENT").length, tone: "info" },
        { label: "accepted", value: rows.filter((r) => r.status === "ACCEPTED").length, tone: "positive" },
      ]}
    >
      <DataTable
        columns={columns}
        data={rows}
        searchPlaceholder="Search estimates..."
        moduleColor="proposals"
        emptyState={{ title: "No estimates", description: "Create your first estimate to quote work." }}
      />
    </ListPageLayout>
  );
}
