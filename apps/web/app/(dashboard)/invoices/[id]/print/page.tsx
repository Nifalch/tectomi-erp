"use client";

import { useParams } from "next/navigation";
import { NuroInvoicePrint, type NuroOrgInfo } from "@/components/accounting/nuro-invoice-print";
import { useInvoice, useOrgSettings } from "@/lib/api/hooks";
import { LoadingState } from "@/components/ui/state";

interface InvoiceClient {
  companyName?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
}

interface InvoiceProject {
  name?: string;
}

interface InvoiceLine {
  description?: string;
  quantity?: number;
  price?: number;
  unitPrice?: number;
  amount?: number;
  duration?: string;
}

interface InvoiceAllocation {
  amount?: number | string;
}

export default function InvoicePrintPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const q = useInvoice(id);
  const org = useOrgSettings();

  if (q.isLoading) return <LoadingState label="Preparing..." />;
  if (!q.data) return null;

  const inv = q.data as Record<string, unknown>;
  const client = inv.client as InvoiceClient | undefined;
  const project = inv.project as InvoiceProject | undefined;

  const clientName =
    client?.contactPerson?.trim()
    || client?.companyName?.trim()
    || "—";

  const allocations = (inv.allocations as InvoiceAllocation[] | undefined) ?? [];
  const paidAmount = allocations.reduce((sum, a) => sum + Number(a.amount ?? 0), 0);
  const subtotal = Number(inv.subtotal ?? inv.amount ?? 0);
  const discount = Number(inv.discountAmount ?? 0);
  const total = Number(inv.total ?? subtotal - discount);
  // BALANCE = (SUB TOTAL − DISCOUNT) − PAYMENT RECEIVED.
  const balanceTotal = Math.max(0, subtotal - discount - paidAmount);

  return (
    <NuroInvoicePrint
      org={(org.data ?? undefined) as NuroOrgInfo | undefined}
      doc={{
        number: String(inv.invoiceNumber ?? ""),
        referenceNumber: inv.referenceNumber as string | undefined,
        status: inv.status as string | undefined,
        issueDate: (inv.issueDate as string | undefined) ?? (inv.createdAt as string | undefined),
        dueDate: inv.dueDate as string | undefined,
        projectName: project?.name,
        clientName,
        clientCompany: client?.companyName,
        clientAddress: client?.address,
        clientEmail: client?.email,
        clientPhone: client?.phone,
        items: ((inv.items as InvoiceLine[]) ?? []).map((it) => ({
          description: it.description,
          quantity: it.quantity != null ? Number(it.quantity) : undefined,
          price: Number(it.price ?? it.unitPrice ?? 0),
          amount: it.amount != null ? Number(it.amount) : undefined,
          duration: it.duration,
        })),
        subtotal,
        tax: Number(inv.tax ?? 0),
        discount,
        total,
        paidAmount,
        balanceTotal,
        advance: inv.advanceAmount != null ? Number(inv.advanceAmount) : undefined,
        leadNote: inv.leadNote as string | undefined,
        notes: inv.notes as string | undefined,
      }}
    />
  );
}
