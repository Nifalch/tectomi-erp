"use client";

import { useParams } from "next/navigation";
import { NuroInvoicePrint, type NuroOrgInfo } from "@/components/accounting/nuro-invoice-print";
import { useEstimate, useOrgSettings } from "@/lib/api/hooks";
import { LoadingState } from "@/components/ui/state";

interface EstimateClient {
  companyName?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
}

interface EstimateProject {
  name?: string;
}

interface EstimateLine {
  description?: string;
  quantity?: number;
  price?: number;
  amount?: number;
}

export default function EstimatePrintPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const q = useEstimate(id);
  const org = useOrgSettings();

  if (q.isLoading) return <LoadingState label="Preparing..." />;
  if (!q.data) return null;

  const est = q.data as Record<string, unknown>;
  const client = est.client as EstimateClient | undefined;
  const project = est.project as EstimateProject | undefined;

  const clientName =
    client?.contactPerson?.trim()
    || client?.companyName?.trim()
    || "—";

  const subtotal = Number(est.subtotal ?? 0);

  return (
    <NuroInvoicePrint
      org={(org.data ?? undefined) as NuroOrgInfo | undefined}
      doc={{
        documentType: "ESTIMATE",
        number: String(est.estimateNumber ?? ""),
        status: est.status as string | undefined,
        issueDate: est.issueDate as string | undefined,
        dueDate: est.expiryDate as string | undefined,
        projectName: project?.name,
        clientName,
        clientCompany: client?.companyName,
        clientAddress: client?.address,
        clientEmail: client?.email,
        clientPhone: client?.phone,
        items: ((est.items as EstimateLine[]) ?? []).map((it) => ({
          description: it.description,
          quantity: it.quantity != null ? Number(it.quantity) : undefined,
          price: Number(it.price ?? 0),
          amount: it.amount != null ? Number(it.amount) : undefined,
        })),
        subtotal,
        tax: Number(est.tax ?? est.taxAmount ?? 0),
        discount: Number(est.discountAmount ?? 0),
        total: Number(est.total ?? subtotal),
        balanceTotal: subtotal,
        paidAmount: 0,
        notes: est.notes as string | undefined,
      }}
    />
  );
}
