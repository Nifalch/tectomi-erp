"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, Send, CheckCircle2, Plus, Pencil } from "lucide-react";
import { CreateInvoiceDialog } from "@/components/invoices/create-invoice-dialog";
import { ListPageLayout } from "@/components/layouts/list-page-layout";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useInvoices } from "@/lib/api/hooks";
import { useSendInvoice, useMarkInvoicePaid } from "@/lib/api/mutations";
import { formatCurrency, toArray } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  client: { companyName: string };
  total: number;
  dueDate?: string;
  status: string;
}

export default function InvoicesPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const query = useInvoices();
  const sendMutation = useSendInvoice();
  const payMutation = useMarkInvoicePaid();

  if (query.isLoading) return <LoadingState label="Loading invoices..." />;
  if (query.isError || !query.data) return <ErrorState label="Unable to load invoices." />;

  const invoices = toArray<InvoiceRow>(query.data);

  const columns: ColumnDef<InvoiceRow, unknown>[] = [
    { accessorKey: "invoiceNumber", header: "Invoice #", cell: ({ row }) => (
      <Link href={`/invoices/${row.original.id}/print`} target="_blank" className="font-medium text-primary hover:underline">
        {row.original.invoiceNumber}
      </Link>
    ) },
    { id: "client", header: "Client", cell: ({ row }) => row.original.client?.companyName ?? "—" },
    { accessorKey: "total", header: "Total", cell: ({ row }) => formatCurrency(Number(row.original.total) || 0) },
    { accessorKey: "dueDate", header: "Due Date", cell: ({ row }) => row.original.dueDate ? new Date(row.original.dueDate).toLocaleDateString() : "—" },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          {/* Edit allowed on every status except PAID/VOID (those are completed
              audit states; API enforces this too). */}
          {row.original.status !== "PAID" && row.original.status !== "VOID" && (
            <Link href={`/invoices/${row.original.id}/edit`}>
              <Button size="sm" variant="ghost" title="Edit">
                <Pencil className="size-4" />
              </Button>
            </Link>
          )}
          {row.original.status === "DRAFT" && (
            <Button size="sm" variant="ghost" onClick={() => sendMutation.mutate(row.original.id)} title="Send">
              <Send className="size-4" />
            </Button>
          )}
          {(row.original.status === "SENT" || row.original.status === "OVERDUE") && (
            <Button size="sm" variant="ghost" onClick={() => payMutation.mutate(row.original.id)} title="Mark Paid">
              <CheckCircle2 className="size-4 text-emerald-500" />
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => window.open(`/invoices/${row.original.id}/print`, "_blank")}
            title="Open printable invoice (Tectomi ERP template)"
          >
            <Download className="size-4" />
          </Button>
        </div>
      ),
      enableSorting: false,
    },
  ];

  return (
    <ListPageLayout
      module="invoices"
      title="Invoices"
      description="Invoice lifecycle, payment status, and PDF exports."
      primaryAction={{ label: "New Invoice", icon: <Plus className="mr-1 size-4" />, onClick: () => setCreateOpen(true), permission: "invoices:create" }}
      counts={[
        { label: "paid", value: invoices.filter((i) => i.status === "PAID").length, tone: "positive" },
        { label: "pending", value: invoices.filter((i) => i.status === "SENT").length, tone: "warning" },
        { label: "overdue", value: invoices.filter((i) => i.status === "OVERDUE").length, tone: "destructive" },
      ]}
    >
      <DataTable
        columns={columns}
        data={invoices}
        searchPlaceholder="Search invoices..."
        filterOptions={[{
          column: "status",
          label: "Status",
          options: [
            { value: "DRAFT", label: "Draft" },
            { value: "SENT", label: "Sent" },
            { value: "PAID", label: "Paid" },
            { value: "OVERDUE", label: "Overdue" },
          ],
        }]}
        moduleColor="invoices"
        emptyState={{ title: "No invoices", description: "Invoices will appear here when created." }}
      />
      <CreateInvoiceDialog open={createOpen} onOpenChange={setCreateOpen} />
    </ListPageLayout>
  );
}
