"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Printer, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { useEstimate } from "@/lib/api/hooks";
import { formatCurrency } from "@/lib/utils";

interface EstimateLine { description?: string; quantity?: number; price?: number; amount?: number }

export default function EstimateDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const query = useEstimate(id);

  if (query.isLoading) return <LoadingState label="Loading estimate..." />;
  if (query.isError || !query.data) return <ErrorState label="Unable to load estimate." />;

  const est = query.data as Record<string, unknown>;
  const client = est.client as { companyName?: string; email?: string; address?: string } | undefined;
  const items = (est.items as EstimateLine[]) ?? [];
  const subtotal = Number(est.subtotal ?? 0);
  const tax = Number(est.tax ?? 0);
  const total = Number(est.total ?? 0);
  const discount = Number(est.discountAmount ?? est.discount ?? 0);

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Estimates", href: "/estimates" }, { label: String(est.estimateNumber ?? "") }]} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{String(est.estimateNumber ?? "")}</h1>
            <StatusBadge status={String(est.status ?? "DRAFT")} />
          </div>
          <p className="text-sm text-slate-500">
            Issued {est.issueDate ? new Date(est.issueDate as string).toLocaleDateString() : "—"}
            {est.expiryDate ? ` · Expires ${new Date(est.expiryDate as string).toLocaleDateString()}` : null}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/estimates/${id}/edit`}>
            <Button variant="secondary" size="sm"><Pencil className="mr-1 size-4" />Edit</Button>
          </Link>
          <Link href={`/estimates/${id}/print`} target="_blank">
            <Button size="sm"><Printer className="mr-1 size-4" />Print / PDF</Button>
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-white p-6 dark:bg-slate-900/80">
        <div className="mb-6 grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">Bill To</div>
            <div className="mt-1 font-medium">{client?.companyName ?? "—"}</div>
            {client?.email && <div className="text-sm text-slate-500">{client.email}</div>}
            {client?.address && <div className="text-sm text-slate-500 whitespace-pre-line">{client.address}</div>}
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-slate-400">Total</div>
            <div className="text-3xl font-bold tabular-nums">{formatCurrency(total)}</div>
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

        <div className="mt-6 ml-auto w-full max-w-xs space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="tabular-nums">{formatCurrency(subtotal)}</span></div>
          {discount > 0 && <div className="flex justify-between"><span className="text-slate-500">Discount</span><span className="tabular-nums">- {formatCurrency(discount)}</span></div>}
          <div className="flex justify-between"><span className="text-slate-500">Tax</span><span className="tabular-nums">{formatCurrency(tax)}</span></div>
          <div className="flex justify-between border-t border-border pt-2 font-semibold"><span>Total</span><span className="tabular-nums">{formatCurrency(total)}</span></div>
        </div>

        {(est.notes || est.terms) ? (
          <div className="mt-6 grid grid-cols-2 gap-6 border-t border-border pt-6 text-sm">
            {est.notes ? <div><div className="font-medium">Notes</div><div className="mt-1 whitespace-pre-line text-slate-600">{String(est.notes)}</div></div> : <div />}
            {est.terms ? <div><div className="font-medium">Terms</div><div className="mt-1 whitespace-pre-line text-slate-600">{String(est.terms)}</div></div> : <div />}
          </div>
        ) : null}
      </div>
    </div>
  );
}
