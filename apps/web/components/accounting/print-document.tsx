"use client";

import { useEffect } from "react";
import Image from "next/image";
import { formatCurrency } from "@/lib/utils";

export interface PrintDocument {
  documentType: string; // "INVOICE" | "ESTIMATE" | "BILL"
  number: string;
  issueDate?: string;
  dueDate?: string;
  expiryDate?: string;
  party?: { name?: string; email?: string; address?: string };
  items: Array<{ description?: string; quantity?: number; price?: number; amount?: number }>;
  subtotal?: number;
  tax?: number;
  discount?: number;
  total?: number;
  notes?: string;
  terms?: string;
}

export function PrintDocumentView({
  doc,
  org,
}: {
  doc: PrintDocument;
  org?: Record<string, unknown>;
}) {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 500);
    return () => clearTimeout(t);
  }, []);

  const orgName = (org?.name as string) ?? "Your Company";
  const orgEmail = (org?.email as string) ?? "";
  const orgPhone = (org?.phone as string) ?? "";
  const orgAddress = (org?.addressLine1 as string) ?? (org?.address as string) ?? "";
  const logo = (org?.logoUrl as string) ?? null;
  const footer = (org?.invoiceFooter as string) ?? "";

  return (
    <>
      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 0; }
          nav, aside, header.app-header, .no-print { display: none !important; }
          body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print-page { margin: 0 !important; box-shadow: none !important; }
        }
      `}</style>
      {/* A4 portrait — 794 × 1123 px at 96dpi (210 × 297 mm). */}
      <div
        className="mx-auto my-8 bg-white p-10 shadow-panel print-page"
        style={{ width: "794px", minHeight: "1123px" }}
      >
        <div className="mb-8 flex items-start justify-between">
          <div>
            {logo ? (
              <Image src={logo} alt={orgName} width={140} height={48} className="object-contain" />
            ) : (
              <div className="text-xl font-bold">{orgName}</div>
            )}
            {orgAddress && <div className="mt-2 whitespace-pre-line text-xs text-slate-500">{orgAddress}</div>}
            {orgEmail && <div className="text-xs text-slate-500">{orgEmail}</div>}
            {orgPhone && <div className="text-xs text-slate-500">{orgPhone}</div>}
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-widest text-slate-400">{doc.documentType}</div>
            <div className="text-2xl font-bold">{doc.number}</div>
            {doc.issueDate && <div className="mt-1 text-xs text-slate-500">Issued: {new Date(doc.issueDate).toLocaleDateString()}</div>}
            {doc.dueDate && <div className="text-xs text-slate-500">Due: {new Date(doc.dueDate).toLocaleDateString()}</div>}
            {doc.expiryDate && <div className="text-xs text-slate-500">Expires: {new Date(doc.expiryDate).toLocaleDateString()}</div>}
          </div>
        </div>

        {doc.party && (
          <div className="mb-6">
            <div className="text-xs uppercase tracking-wide text-slate-400">Bill To</div>
            <div className="mt-1 font-medium">{doc.party.name ?? "—"}</div>
            {doc.party.email && <div className="text-sm text-slate-500">{doc.party.email}</div>}
            {doc.party.address && <div className="text-sm text-slate-500 whitespace-pre-line">{doc.party.address}</div>}
          </div>
        )}

        <table className="w-full text-sm">
          <thead className="border-b-2 border-slate-800 text-xs uppercase">
            <tr>
              <th className="py-2 text-left">Description</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Price</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {doc.items.map((it, i) => (
              <tr key={i} className="border-b border-slate-200">
                <td className="py-2">{it.description}</td>
                <td className="py-2 text-right tabular-nums">{it.quantity ?? 0}</td>
                <td className="py-2 text-right tabular-nums">{formatCurrency(Number(it.price ?? 0))}</td>
                <td className="py-2 text-right tabular-nums">{formatCurrency(Number(it.amount ?? (it.quantity ?? 0) * (it.price ?? 0)))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 ml-auto w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{formatCurrency(Number(doc.subtotal ?? 0))}</span></div>
          {Number(doc.discount ?? 0) > 0 && (
            <div className="flex justify-between"><span>Discount</span><span className="tabular-nums">- {formatCurrency(Number(doc.discount ?? 0))}</span></div>
          )}
          <div className="flex justify-between"><span>Tax</span><span className="tabular-nums">{formatCurrency(Number(doc.tax ?? 0))}</span></div>
          <div className="flex justify-between border-t-2 border-slate-800 pt-1 text-base font-bold"><span>Total</span><span className="tabular-nums">{formatCurrency(Number(doc.total ?? 0))}</span></div>
        </div>

        {(doc.notes || doc.terms) && (
          <div className="mt-10 space-y-3 text-xs text-slate-600">
            {doc.notes && <div><div className="font-semibold">Notes</div><div className="whitespace-pre-line">{doc.notes}</div></div>}
            {doc.terms && <div><div className="font-semibold">Terms</div><div className="whitespace-pre-line">{doc.terms}</div></div>}
          </div>
        )}

        {footer && <div className="mt-8 border-t border-slate-200 pt-3 text-center text-xs text-slate-400 whitespace-pre-line">{footer}</div>}
      </div>
    </>
  );
}
