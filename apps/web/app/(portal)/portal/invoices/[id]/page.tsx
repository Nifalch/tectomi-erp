"use client";
import { useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { NuroInvoicePrint, type NuroInvoiceData, type NuroOrgInfo } from "@/components/accounting/nuro-invoice-print";
import { PrintFitWrap } from "@/components/portal/print-fit-wrap";
import { portalApi } from "@/lib/portal-api";
import { usePortalRefresh } from "@/lib/hooks/use-portal-refresh";

/**
 * Portal invoice detail — reuses the staff-side <NuroInvoicePrint />
 * component so the client sees the exact same branded layout that
 * the PDF export would generate. Org letterhead, bank details, status
 * watermark, payment summary, the works.
 */
export default function PortalInvoiceDetail() {
  const params = useParams();
  const sp = useSearchParams();
  const router = useRouter();
  const id = String(params?.id ?? "");
  const wantsDownload = sp?.get("download") === "1";
  const [inv, setInv] = useState<Record<string, unknown> | null>(null);
  const [org, setOrg] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Re-fetch invoice + org payload on mount / focus / visibility so a
  // staff "mark paid" elsewhere shows up here without a hard reload.
  usePortalRefresh(() => {
    portalApi.invoices.detail(id)
      .then((data) => setInv(data as Record<string, unknown>))
      .catch((e: Error) => setError(e.message));
    portalApi.me()
      .then((data) => setOrg(data as Record<string, unknown>))
      .catch(() => {});
  }, id);

  // When the user clicked Download from the invoice list we landed here
  // with ?download=1. Find the NuroInvoicePrint toolbar's Download
  // button (the only button inside .no-print) and click it once the
  // invoice + org data have loaded and images have had a beat to
  // decode. Then strip the query param so a refresh doesn't re-fire.
  useEffect(() => {
    if (!wantsDownload || !inv || !org) return;
    const timer = setTimeout(() => {
      const btn = document.querySelector<HTMLButtonElement>(".no-print button");
      btn?.click();
      router.replace(`/portal/invoices/${id}`);
    }, 900);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsDownload, inv, org]);

  if (error) {
    return (
      <div className="portal-card p-6" style={{ borderColor: "var(--rose)", color: "var(--rose)" }}>
        <div className="flex items-center gap-2 font-medium">
          <AlertCircle className="size-4" /> Unable to load invoice
        </div>
        <p className="mt-1 text-sm">{error}</p>
        <Link href="/portal/invoices" className="portal-eyebrow mt-4 inline-flex items-center gap-1.5 hover:opacity-70">
          <ArrowLeft className="size-3" /> Back to invoices
        </Link>
      </div>
    );
  }

  if (!inv) return <p style={{ color: "var(--muted)" }}>Loading invoice…</p>;

  // Map the portal payload to the shape the staff print component wants.
  const client = (inv.client ?? null) as { companyName?: string; contactPerson?: string; address?: string; email?: string; phone?: string } | null;
  const project = (inv.project ?? null) as { name?: string } | null;
  const items = (inv.items ?? []) as Array<{
    description?: string;
    quantity?: number | string;
    duration?: string | null;
    price?: number | string;
    unitPrice?: number | string;
    total?: number | string;
  }>;

  const doc: NuroInvoiceData = {
    documentType: "INVOICE",
    number: String(inv.number ?? ""),
    referenceNumber: (inv.referenceNumber as string | undefined) ?? undefined,
    status: inv.status as string | undefined,
    issueDate: inv.issueDate as string | undefined,
    dueDate: inv.dueDate as string | undefined,
    projectName: project?.name,
    clientName: client?.contactPerson || client?.companyName,
    clientCompany: client?.companyName,
    clientAddress: client?.address,
    clientEmail: client?.email,
    clientPhone: client?.phone,
    items: items.map((it) => ({
      description: it.description,
      quantity: it.quantity != null ? Number(it.quantity) : undefined,
      duration: it.duration ?? undefined,
      price: Number(it.unitPrice ?? it.price ?? 0),
      amount: it.total != null ? Number(it.total) : undefined,
    })),
    subtotal: Number(inv.subtotal ?? inv.amount ?? 0),
    tax: Number(inv.tax ?? 0),
    discount: Number(inv.discount ?? 0),
    total: Number(inv.total ?? 0),
    paidAmount: Number(inv.paidAmount ?? 0),
    balanceTotal: Number(inv.balanceTotal ?? 0),
    advance: inv.advance != null ? Number(inv.advance) : undefined,
    leadNote: inv.leadNote as string | undefined,
    notes: inv.notes as string | undefined,
  };

  const orgInfo: NuroOrgInfo = {
    name: (org?.orgName as string | undefined),
    legalName: (org?.orgLegalName as string | undefined) ?? undefined,
    logoUrl: (org?.orgLogoUrl as string | undefined) ?? undefined,
    email: (org?.orgEmail as string | undefined) ?? undefined,
    phone: (org?.orgPhone as string | undefined) ?? undefined,
    website: (org?.orgWebsite as string | undefined) ?? undefined,
    addressLine1: (org?.orgAddressLine1 as string | undefined) ?? undefined,
    addressLine2: (org?.orgAddressLine2 as string | undefined) ?? undefined,
    city: (org?.orgCity as string | undefined) ?? undefined,
    state: (org?.orgState as string | undefined) ?? undefined,
    postalCode: (org?.orgPostalCode as string | undefined) ?? undefined,
    country: (org?.orgCountry as string | undefined) ?? undefined,
    bankName: (org?.bankName as string | undefined) ?? undefined,
    bankAccountNumber: (org?.bankAccountNumber as string | undefined) ?? undefined,
    bankAccountHolder: (org?.bankAccountHolder as string | undefined) ?? undefined,
    bankBranch: (org?.bankBranch as string | undefined) ?? undefined,
    bankIfsc: (org?.bankIfsc as string | undefined) ?? undefined,
    bankUpi: (org?.bankUpi as string | undefined) ?? undefined,
    stampUrl: (org?.orgStampUrl as string | undefined) ?? undefined,
    invoiceTerms: (org?.invoiceTerms as string | undefined) ?? undefined,
  };

  return (
    <div className="space-y-4">
      <Link href="/portal/invoices" className="portal-eyebrow inline-flex items-center gap-1.5 hover:opacity-70">
        <ArrowLeft className="size-3" /> All invoices
      </Link>
      {/* The branded invoice is rendered at fixed A4 width (794px). The
          PrintFitWrap shrinks it via CSS transform on narrow viewports
          so the whole sheet fits without sideways scrolling — text gets
          small but readable; pinch-zoom or tap Download PDF for detail. */}
      <PrintFitWrap>
        <NuroInvoicePrint doc={doc} org={orgInfo} />
      </PrintFitWrap>
      <p className="text-center text-[11px] sm:hidden" style={{ color: "var(--muted)" }}>
        Pinch to zoom in, or tap Download PDF for a clean copy.
      </p>
    </div>
  );
}
