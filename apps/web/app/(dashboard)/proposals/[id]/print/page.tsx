"use client";

import { useParams } from "next/navigation";
import { NuroProposalPrint, type NuroOrgInfo } from "@/components/accounting/nuro-proposal-print";
import { useProposal, useOrgSettings } from "@/lib/api/hooks";
import { LoadingState, ErrorState } from "@/components/ui/state";

interface ProposalClient {
  companyName?: string;
  contactPerson?: string;
  email?: string;
  address?: string;
}
interface ProposalUser { firstName?: string; lastName?: string; email?: string }
interface ProposalBlock { heading?: string; content?: string; sortOrder?: number }
interface ProposalDeliverable { kind: "INCLUDED" | "EXCLUDED" | string; title: string; description?: string; sortOrder?: number }
interface ProposalAcceptance {
  decision: "ACCEPTED" | "REJECTED";
  decidedAt: string;
  note?: string | null;
  ip?: string;
  contact?: { name?: string | null; email?: string | null } | null;
}

export default function ProposalPrintPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const q = useProposal(id);
  const org = useOrgSettings();

  if (q.isLoading) return <LoadingState label="Preparing..." />;
  if (q.isError || !q.data) return <ErrorState label="Unable to load proposal." />;

  const p = q.data as Record<string, unknown>;
  const client = p.client as ProposalClient | undefined;
  const createdBy = p.createdBy as ProposalUser | undefined;

  const clientName =
    client?.contactPerson?.trim()
    || client?.companyName?.trim()
    || "—";
  const preparedBy = createdBy
    ? `${createdBy.firstName ?? ""} ${createdBy.lastName ?? ""}`.trim() || createdBy.email
    : undefined;

  return (
    <NuroProposalPrint
      org={(org.data ?? undefined) as NuroOrgInfo | undefined}
      doc={{
        id: String(p.id ?? ""),
        projectName: (p.projectName as string) ?? undefined,
        status: (p.status as string) ?? "DRAFT",
        createdAt: (p.createdAt as string) ?? undefined,
        validUntil: (p.validUntil as string | null) ?? null,
        clientName,
        clientEmail: client?.email,
        clientAddress: client?.address,
        preparedBy,
        description: (p.description as string) ?? undefined,
        projectUnderstanding: (p.projectUnderstanding as string | null) ?? null,
        timeline: (p.timeline as string) ?? undefined,
        pricing: (p.pricing as string) ?? undefined,
        paymentTermsText: (p.paymentTermsText as string | null) ?? null,
        blocks: (p.blocks as ProposalBlock[]) ?? [],
        deliverables: (p.deliverables as ProposalDeliverable[]) ?? [],
        acceptance: (p.acceptance as ProposalAcceptance | null) ?? null,
      }}
    />
  );
}
