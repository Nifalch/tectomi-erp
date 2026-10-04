"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Send, CheckCircle2, XCircle, FileText, Plus, Trash2, Pencil,
  ExternalLink, Search, Calendar, User, MoreHorizontal,
} from "lucide-react";
import { ListPageLayout } from "@/components/layouts/list-page-layout";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useProposals } from "@/lib/api/hooks";
import { useSendProposal, useAcceptProposal, useRejectProposal, useDeleteProposal, useResendProposal, useForceAcceptProposal } from "@/lib/api/mutations";
import { usePermission } from "@/lib/hooks/use-permission";
import { formatCurrency, toArray } from "@/lib/utils";

interface ProposalRow {
  id: string;
  projectName?: string;
  client?: { companyName?: string; contactPerson?: string; email?: string };
  pricing?: string;
  status: "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED";
  createdAt?: string;
  validUntil?: string | null;
  deliverables?: Array<{ kind: string; amount?: number | string | null }>;
}

const STATUS_OPTIONS = [
  { value: "ALL", label: "All statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "SENT", label: "Sent" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "REJECTED", label: "Rejected" },
  { value: "EXPIRED", label: "Expired" },
];

const STATUS_ACCENT: Record<ProposalRow["status"], string> = {
  DRAFT:    "border-l-slate-400",
  SENT:     "border-l-blue-500",
  ACCEPTED: "border-l-emerald-500",
  REJECTED: "border-l-rose-500",
  EXPIRED:  "border-l-amber-500",
};

function num(v: unknown): number {
  if (typeof v === "number") return v;
  return Number(v ?? 0) || 0;
}

function totalValueOf(p: ProposalRow): number {
  // Prefer summed deliverable amounts. Fall back to parsing the pricing string.
  const sum = (p.deliverables ?? [])
    .filter((d) => d.kind === "INCLUDED" && d.amount != null)
    .reduce((s, d) => s + num(d.amount), 0);
  if (sum > 0) return sum;
  if (p.pricing) {
    const cleaned = String(p.pricing).replace(/[^\d.]/g, "");
    return Number(cleaned) || 0;
  }
  return 0;
}

export default function ProposalsPage() {
  const router = useRouter();
  const query = useProposals();
  const sendMutation = useSendProposal();
  const acceptMutation = useAcceptProposal();
  const rejectMutation = useRejectProposal();
  const resendMutation = useResendProposal();
  const forceAcceptMutation = useForceAcceptProposal();
  const deleteMutation = useDeleteProposal();
  const canDelete = usePermission("clients:delete"); // Roughly: super-admin / admin tier

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [deleteTarget, setDeleteTarget] = useState<ProposalRow | null>(null);

  const proposals = toArray<ProposalRow>(query.data);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return proposals.filter((p) => {
      if (statusFilter !== "ALL" && p.status !== statusFilter) return false;
      if (!q) return true;
      const haystack = [p.projectName, p.client?.companyName, p.client?.contactPerson, p.client?.email]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [proposals, search, statusFilter]);

  const counts = useMemo(() => {
    const c = { total: proposals.length, draft: 0, sent: 0, accepted: 0, rejected: 0, value: 0, won: 0 };
    proposals.forEach((p) => {
      const v = totalValueOf(p);
      c.value += v;
      if (p.status === "DRAFT") c.draft++;
      else if (p.status === "SENT") c.sent++;
      else if (p.status === "ACCEPTED") { c.accepted++; c.won += v; }
      else if (p.status === "REJECTED") c.rejected++;
    });
    return c;
  }, [proposals]);

  if (query.isLoading) return <LoadingState label="Loading proposals..." />;
  if (query.isError) return <ErrorState label="Unable to load proposals." />;

  return (
    <ListPageLayout
      module="proposals"
      title="Proposals"
      description="Branded proposals with status tracking — send, accept, or reject."
      primaryAction={{
        label: "New Proposal",
        icon: <Plus className="mr-1 size-4" />,
        onClick: () => router.push("/proposals/new"),
      }}
    >
      {/* ── KPI strip ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Total" value={String(counts.total)} accent="bg-slate-100 text-slate-700" />
        <KpiCard label="Draft" value={String(counts.draft)} accent="bg-slate-100 text-slate-700" />
        <KpiCard label="Sent" value={String(counts.sent)} accent="bg-blue-100 text-blue-700" />
        <KpiCard label="Accepted" value={String(counts.accepted)} accent="bg-emerald-100 text-emerald-700" />
        <KpiCard
          label="Won value"
          value={formatCurrency(counts.won)}
          accent="bg-emerald-50 text-emerald-700"
          subtext={counts.value > 0 ? `${formatCurrency(counts.value)} pipeline` : undefined}
        />
      </div>

      {/* ── Search + filter ── */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by project or client..."
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={setStatusFilter}
          options={STATUS_OPTIONS}
          className="w-44"
        />
      </div>

      {/* ── Cards grid ── */}
      {filtered.length === 0 ? (
        <Card className="mt-6 py-16 text-center">
          <FileText className="mx-auto size-10 text-slate-300" />
          <div className="mt-3 text-base font-semibold text-slate-700">No proposals match</div>
          <div className="mt-1 text-sm text-slate-500">
            {proposals.length === 0
              ? 'Click "New Proposal" to create the first one.'
              : "Try clearing your search or status filter."}
          </div>
          {proposals.length === 0 && (
            <Button className="mt-4" onClick={() => router.push("/proposals/new")}>
              <Plus className="mr-1 size-4" /> New Proposal
            </Button>
          )}
        </Card>
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => {
            const value = totalValueOf(p);
            const isExpired =
              p.validUntil && new Date(p.validUntil) < new Date() && p.status !== "ACCEPTED" && p.status !== "REJECTED";
            return (
              <div
                key={p.id}
                className={`group relative rounded-2xl border-l-4 ${STATUS_ACCENT[p.status]} border border-border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-panel dark:bg-slate-900/80`}
              >
                {/* Top row — status + actions */}
                <div className="flex items-start justify-between gap-3">
                  <StatusBadge status={p.status} dot size="sm" />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                        aria-label="More actions"
                      >
                        <MoreHorizontal className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => window.open(`/proposals/${p.id}/print`, "_blank")}>
                        <ExternalLink className="mr-2 size-4" /> Open print view
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => window.location.assign(`/proposals/${p.id}/edit`)}>
                        <Pencil className="mr-2 size-4" /> Edit
                      </DropdownMenuItem>
                      {p.status === "DRAFT" && (
                        <DropdownMenuItem onClick={() => sendMutation.mutate(p.id)} disabled={sendMutation.isPending}>
                          <Send className="mr-2 size-4 text-blue-600" /> Mark sent
                        </DropdownMenuItem>
                      )}
                      {p.status === "SENT" && (
                        <>
                          <DropdownMenuItem onClick={() => acceptMutation.mutate(p.id)} disabled={acceptMutation.isPending}>
                            <CheckCircle2 className="mr-2 size-4 text-emerald-600" /> Mark accepted
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => rejectMutation.mutate(p.id)} disabled={rejectMutation.isPending}>
                            <XCircle className="mr-2 size-4 text-rose-600" /> Mark rejected
                          </DropdownMenuItem>
                        </>
                      )}
                      {p.status === "REJECTED" && (
                        <>
                          {/*
                            Recovery actions on a rejected proposal:
                            "Resend" wipes the client's rejection and
                            flips it back to SENT so they can decide
                            again — useful when the PM has tweaked the
                            scope. "Force accept" is the admin escape
                            hatch when approval came through outside
                            the portal (call/email).
                          */}
                          <DropdownMenuItem onClick={() => resendMutation.mutate(p.id)} disabled={resendMutation.isPending}>
                            <Send className="mr-2 size-4 text-blue-600" /> Resend to client
                          </DropdownMenuItem>
                          {canDelete && (
                            <DropdownMenuItem onClick={() => forceAcceptMutation.mutate(p.id)} disabled={forceAcceptMutation.isPending}>
                              <CheckCircle2 className="mr-2 size-4 text-emerald-600" /> Force accept (admin)
                            </DropdownMenuItem>
                          )}
                        </>
                      )}
                      {canDelete && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setDeleteTarget(p)} className="text-rose-600 focus:text-rose-600">
                            <Trash2 className="mr-2 size-4" /> Delete
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Title & client */}
                <Link href={`/proposals/${p.id}/print`} target="_blank" className="mt-3 block">
                  <div className="line-clamp-2 text-base font-bold leading-tight text-slate-900 transition group-hover:text-primary dark:text-slate-100">
                    {p.projectName ?? "Untitled"}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                    <User className="size-3" />
                    {p.client?.companyName ?? "—"}
                    {p.client?.contactPerson ? <span className="text-slate-400">· {p.client.contactPerson}</span> : null}
                  </div>
                </Link>

                {/* Value + dates */}
                <div className="mt-4 flex items-end justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Value</div>
                    <div className="mt-0.5 text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">
                      {value > 0 ? formatCurrency(value) : "—"}
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    {p.createdAt && (
                      <div className="flex items-center justify-end gap-1">
                        <Calendar className="size-3" />
                        <span>Created {new Date(p.createdAt).toLocaleDateString()}</span>
                      </div>
                    )}
                    {p.validUntil && (
                      <div className={`mt-0.5 ${isExpired ? "font-semibold text-amber-600" : ""}`}>
                        {isExpired ? "Expired " : "Valid until "}
                        {new Date(p.validUntil).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>

                {/* Quick action — view */}
                <Link
                  href={`/proposals/${p.id}/print`}
                  target="_blank"
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-slate-800"
                >
                  <ExternalLink className="size-3.5" />
                  Open Proposal
                </Link>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        title="Delete proposal"
        description={
          deleteTarget
            ? `Permanently delete "${deleteTarget.projectName}"? All scope phases and deliverables will be removed. This cannot be undone.`
            : ""
        }
        variant="destructive"
        confirmLabel="Delete proposal"
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
          }
        }}
        loading={deleteMutation.isPending}
      />
    </ListPageLayout>
  );
}

function KpiCard({
  label,
  value,
  accent,
  subtext,
}: {
  label: string;
  value: string;
  accent: string;
  subtext?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-white p-4 dark:bg-slate-900/80">
      <div className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${accent}`}>
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">{value}</div>
      {subtext && <div className="mt-0.5 text-xs text-slate-500">{subtext}</div>}
    </div>
  );
}
