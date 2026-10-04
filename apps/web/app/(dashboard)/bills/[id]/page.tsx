"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Printer, Pencil, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { useBill } from "@/lib/api/hooks";
import { formatCurrency } from "@/lib/utils";

export default function BillDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const query = useBill(id);

  if (query.isLoading) return <LoadingState label="Loading bill..." />;
  if (query.isError || !query.data) return <ErrorState label="Unable to load bill." />;

  const b = query.data as Record<string, unknown>;
  const vendor = b.vendor as { name?: string; companyName?: string; email?: string; address?: string } | undefined;
  const items = (b.items as Array<{ description?: string; quantity?: number; price?: number; amount?: number }>) ?? [];
  const total = Number(b.total ?? 0);
  const paid = Number(b.amountPaid ?? 0);

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Bills", href: "/bills" }, { label: String(b.billNumber ?? "") }]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{String(b.billNumber ?? "")}</h1>
            <StatusBadge status={String(b.status ?? "DRAFT")} />
          </div>
          <p className="text-sm text-slate-500">
            Issued {b.issueDate ? new Date(b.issueDate as string).toLocaleDateString() : "—"}
            {b.dueDate ? ` · Due ${new Date(b.dueDate as string).toLocaleDateString()}` : null}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/bills/${id}/edit`}><Button variant="secondary" size="sm"><Pencil className="mr-1 size-4" />Edit</Button></Link>
          <Link href={`/payments?type=MADE&billId=${id}`}><Button size="sm"><CreditCard className="mr-1 size-4" />Record Payment</Button></Link>
          <Link href={`/bills/${id}/print`} target="_blank"><Button variant="secondary" size="sm"><Printer className="mr-1 size-4" />Print</Button></Link>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-white p-6 dark:bg-slate-900/80">
        <div className="mb-6 grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">From</div>
            <div className="mt-1 font-medium">{vendor?.name ?? vendor?.companyName ?? "—"}</div>
            {vendor?.email && <div className="text-sm text-slate-500">{vendor.email}</div>}
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-slate-400">Balance Due</div>
            <div className="text-3xl font-bold tabular-nums">{formatCurrency(total - paid)}</div>
            <div className="text-xs text-slate-500">of {formatCurrency(total)}</div>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="py-2 text-left">Description</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Price</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-b border-border/50">
                <td className="py-3">{it.description ?? ""}</td>
                <td className="py-3 text-right tabular-nums">{it.quantity ?? 0}</td>
                <td className="py-3 text-right tabular-nums">{formatCurrency(Number(it.price ?? 0))}</td>
                <td className="py-3 text-right tabular-nums">{formatCurrency(Number(it.amount ?? (it.quantity ?? 0) * (it.price ?? 0)))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
