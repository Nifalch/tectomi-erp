"use client";

import { useParams } from "next/navigation";
import { PrintDocumentView } from "@/components/accounting/print-document";
import { useBill, useOrgSettings } from "@/lib/api/hooks";
import { LoadingState } from "@/components/ui/state";

export default function BillPrintPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const q = useBill(id);
  const org = useOrgSettings();

  if (q.isLoading) return <LoadingState label="Preparing..." />;
  if (!q.data) return null;

  const b = q.data as Record<string, unknown>;
  const vendor = b.vendor as { name?: string; companyName?: string; email?: string; address?: string } | undefined;
  return (
    <PrintDocumentView
      org={org.data}
      doc={{
        documentType: "BILL",
        number: String(b.billNumber ?? ""),
        issueDate: b.issueDate as string | undefined,
        dueDate: b.dueDate as string | undefined,
        party: vendor ? { name: vendor.name ?? vendor.companyName, email: vendor.email, address: vendor.address } : undefined,
        items: (b.items as Array<{ description?: string; quantity?: number; price?: number; amount?: number }>) ?? [],
        subtotal: Number(b.subtotal ?? 0),
        tax: Number(b.tax ?? 0),
        discount: Number(b.discountAmount ?? b.discount ?? 0),
        total: Number(b.total ?? 0),
        notes: b.notes as string | undefined,
        terms: b.terms as string | undefined,
      }}
    />
  );
}
