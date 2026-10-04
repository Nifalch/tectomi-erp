"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertCircle, Check, X } from "lucide-react";
import { NuroProposalPrint, type NuroProposalData, type NuroOrgInfo } from "@/components/accounting/nuro-proposal-print";
import { PrintFitWrap } from "@/components/portal/print-fit-wrap";
import { portalApi } from "@/lib/portal-api";
import { usePortalRefresh } from "@/lib/hooks/use-portal-refresh";

interface ProposalDetail {
  id: string;
  title: string;
  status: string;
  sentAt: string | null;
  validUntil: string | null;
  createdAt: string | null;
  description: string | null;
  projectUnderstanding: string | null;
  timeline: string | null;
  pricing: string | null;
  paymentTermsText: string | null;
  // DB field is `content` (matches ProposalBlock.content in Prisma schema +
  // NuroProposalBlock.content in the print component). The earlier `body`
  // interface mismatch silently dropped all phase descriptions on the
  // client side — clients saw empty phase cards while staff PDFs were fine.
  blocks: Array<{ id: string; heading?: string | null; content?: string | null; sortOrder?: number | null; durationWeeks?: number | null }>;
  deliverables: Array<{ id: string; kind: string; title: string; description?: string | null; amount?: number | string | null; sortOrder?: number | null }>;
  acceptance: { decision: string; decidedAt: string; note: string | null } | null;
}

/**
 * Portal proposal detail — uses the staff-side <NuroProposalPrint />
 * component so clients see the same multi-page branded layout that
 * the PDF export would produce. Accept / Reject buttons appear below
 * (or the recorded decision) once the proposal is still pending.
 */
export default function PortalProposalDetail() {
  const params = useParams();
  const id = String(params?.id ?? "");
  const [p, setP] = useState<ProposalDetail | null>(null);
  const [org, setOrg] = useState<Record<string, unknown> | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = () => portalApi.proposals.detail(id).then((d) => setP(d as ProposalDetail));
  usePortalRefresh(() => {
    void load();
    portalApi.me().then((m) => setOrg(m as Record<string, unknown>)).catch(() => {});
  }, id);

  const decide = async (decision: "ACCEPTED" | "REJECTED") => {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      await portalApi.proposals.decide(id, decision, note.trim() || undefined);
    } catch (e) {
      // Only set err when the decision itself failed. A failed refetch
      // afterwards should NOT show a "Failed" banner — the decision
      // was already committed.
      setErr((e as Error).message ?? "Failed");
      setBusy(false);
      return;
    }
    // Best-effort refresh; swallow refetch errors so the user doesn't
    // see "Failed" right after a successful accept/reject.
    await load().catch(() => undefined);
    setBusy(false);
  };

  if (err && !p) {
    return (
      <div className="portal-card p-6" style={{ borderColor: "var(--rose)", color: "var(--rose)" }}>
        <div className="flex items-center gap-2 font-medium">
          <AlertCircle className="size-4" /> Unable to load proposal
        </div>
        <p className="mt-1 text-sm">{err}</p>
        <Link href="/portal/proposals" className="portal-eyebrow mt-4 inline-flex items-center gap-1.5 hover:opacity-70">
          <ArrowLeft className="size-3" /> Back to proposals
        </Link>
      </div>
    );
  }
  if (!p) return <p style={{ color: "var(--muted)" }}>Loading proposal…</p>;

  const doc: NuroProposalData = {
    id: p.id,
    projectName: p.title,
    // Dates the cover/footer use. createdAt drives "May 2026" and the
    // "valid until" line; both were missing in the previous portal
    // render which is why dates didn't match the staff PDF.
    createdAt: p.createdAt ?? p.sentAt ?? undefined,
    validUntil: p.validUntil,
    description: p.description ?? undefined,
    projectUnderstanding: p.projectUnderstanding,
    timeline: p.timeline ?? undefined,
    pricing: p.pricing ?? undefined,
    paymentTermsText: p.paymentTermsText,
    // NuroProposalBlock expects strings | undefined, never null —
    // coerce the API's nullable fields before handing off.
    blocks: p.blocks.map((b) => ({
      id: b.id,
      heading: b.heading ?? undefined,
      content: b.content ?? undefined,
      sortOrder: b.sortOrder ?? undefined,
      durationWeeks: b.durationWeeks ?? undefined,
    })),
    deliverables: p.deliverables.map((d) => ({
      id: d.id,
      kind: (d.kind === "INCLUDED" || d.kind === "EXCLUDED") ? d.kind : "INCLUDED",
      title: d.title,
      description: d.description ?? undefined,
      amount: d.amount != null ? Number(d.amount) : undefined,
      sortOrder: d.sortOrder ?? undefined,
    })),
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
  };

  // Status-driven UX:
  //  - ACCEPTED → locked, just show the decision (no buttons).
  //  - REJECTED → show the prior decision + an "Accept proposal" CTA
  //    so the client can flip their mind.
  //  - SENT → first-time Accept / Reject pair.
  const isAccepted = p.status === "ACCEPTED" || p.acceptance?.decision === "ACCEPTED";
  const isRejected = p.status === "REJECTED" || (p.acceptance?.decision === "REJECTED" && p.status !== "ACCEPTED");
  const isFirstDecision = p.status === "SENT" && !p.acceptance;

  return (
    <div className="space-y-4">
      <Link href="/portal/proposals" className="portal-eyebrow inline-flex items-center gap-1.5 hover:opacity-70">
        <ArrowLeft className="size-3" /> All proposals
      </Link>

      {/* Proposal renders at fixed A4 width; PrintFitWrap scales it
          down to fit the viewport on phones — same approach as the
          invoice detail page. */}
      <PrintFitWrap>
        <NuroProposalPrint doc={doc} org={orgInfo} />
      </PrintFitWrap>
      <p className="text-center text-[11px] sm:hidden" style={{ color: "var(--muted)" }}>
        Pinch to zoom in for detail, then use Accept / Reject below when you're ready.
      </p>

      <div className="mx-auto" style={{ width: "794px", maxWidth: "100%" }}>
        {isAccepted && (
          /* Locked — once accepted, decisions can't be changed. The
             accepted state is the contractual go-ahead, so making it
             reversible would create disputes downstream. */
          <div className="portal-card-warm mt-4 p-5">
            <div className="portal-eyebrow">Decision on file</div>
            <div className="mt-2 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[14px] font-semibold" style={{ color: "var(--emerald)" }}>
                <Check className="size-4" /> Accepted
              </span>
              {p.acceptance?.decidedAt && (
                <span className="text-[12px]" style={{ color: "var(--muted)" }}>
                  · {new Date(p.acceptance.decidedAt).toLocaleString("en-IN", { dateStyle: "long", timeStyle: "short" })}
                </span>
              )}
            </div>
            {p.acceptance?.note && (
              <p className="mt-2 text-[13px]" style={{ color: "var(--ink-soft)" }}>&ldquo;{p.acceptance.note}&rdquo;</p>
            )}
            <p className="mt-3 text-[11px]" style={{ color: "var(--muted)" }}>
              This decision is final. Reach out to your project coordinator if you need to revise scope.
            </p>
          </div>
        )}

        {isRejected && !isAccepted && (
          /* Soft state — the client rejected but can change their
             mind without bothering the PM. Accept here flips
             REJECTED → ACCEPTED through the same endpoint. */
          <div className="portal-card mt-4 p-5">
            <div className="portal-eyebrow">Decision on file</div>
            <div className="mt-2 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[14px] font-semibold" style={{ color: "var(--rose)" }}>
                <X className="size-4" /> Rejected
              </span>
              {p.acceptance?.decidedAt && (
                <span className="text-[12px]" style={{ color: "var(--muted)" }}>
                  · {new Date(p.acceptance.decidedAt).toLocaleString("en-IN", { dateStyle: "long", timeStyle: "short" })}
                </span>
              )}
            </div>
            {p.acceptance?.note && (
              <p className="mt-2 text-[13px]" style={{ color: "var(--ink-soft)" }}>&ldquo;{p.acceptance.note}&rdquo;</p>
            )}
            <div className="portal-hairline my-4" />
            <p className="text-[13px] font-medium" style={{ color: "var(--ink)" }}>Changed your mind?</p>
            <p className="mt-1 text-[12px]" style={{ color: "var(--muted)" }}>
              You can still accept this proposal. Once you accept, the decision is final.
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note for our team…"
              rows={2}
              className="portal-input mt-3"
            />
            {err && (
              <p className="mt-2 text-[12px]" style={{ color: "var(--rose)" }}>{err}</p>
            )}
            <button
              type="button"
              onClick={() => decide("ACCEPTED")}
              disabled={busy}
              className="portal-cta portal-cta-accent mt-3"
            >
              <Check className="size-3.5" /> {busy ? "Saving…" : "Accept proposal now"}
            </button>
          </div>
        )}

        {isFirstDecision && (
          <div className="portal-card mt-4 p-5">
            <div className="portal-eyebrow">Your decision</div>
            <p className="mt-1 text-[13px]" style={{ color: "var(--muted)" }}>
              Accept to proceed with this scope, or reject with a note so we can revise. You can change a rejection later, but acceptance is final.
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note for our team…"
              rows={3}
              className="portal-input mt-3"
            />
            {err && (
              <p className="mt-2 text-[12px]" style={{ color: "var(--rose)" }}>{err}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => decide("ACCEPTED")}
                disabled={busy}
                className="portal-cta portal-cta-accent"
              >
                <Check className="size-3.5" /> {busy ? "Saving…" : "Accept proposal"}
              </button>
              <button
                type="button"
                onClick={() => decide("REJECTED")}
                disabled={busy}
                className="portal-btn-ghost"
                style={{ color: "var(--rose)" }}
              >
                <X className="size-3.5" /> Reject
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
