"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useProposals } from "@/lib/api/hooks";
import { apiPost } from "@/lib/api/client";
import { toast } from "@/lib/hooks/use-toast";
import { toArray } from "@/lib/utils";
import { FileText, ExternalLink, Calendar, Sparkles } from "lucide-react";

type ProposalRow = {
  id: string;
  projectId?: string | null;
  projectName?: string | null;
  status?: string;
  pricing?: string;
  timeline?: string;
  description?: string;
  validUntil?: string | null;
  createdAt?: string;
  client?: { companyName?: string } | null;
};

const STATUS_TONE: Record<string, "neutral" | "info" | "positive" | "warning" | "destructive"> = {
  DRAFT: "neutral",
  SENT: "info",
  ACCEPTED: "positive",
  REJECTED: "destructive",
  EXPIRED: "warning",
};

/**
 * Project-scoped Proposals tab. Filters the org-wide proposals list
 * down to just the ones tied to this project so the PM doesn't have
 * to leave the project page to find the matching pitch + scope doc.
 */
export function ProjectProposalsTab({ projectId }: { projectId: string }) {
  // Scoped to this project — server-side filter so we don't pull the
  // org-wide proposals list (data-leak + scaling concern).
  const query = useProposals({ projectId });
  const router = useRouter();
  const qc = useQueryClient();

  // Backfill mutation — builds a proposal from the project's existing
  // milestones/tasks/budget. No AI call required, so this works even
  // when GEMINI_API_KEY is unset or hitting quotas.
  const generateMutation = useMutation({
    mutationFn: () =>
      apiPost<{ proposalId: string }>(`/projects/${projectId}/generate-proposal`, {}),
    onSuccess: (data) => {
      toast({
        variant: "success",
        title: "Proposal generated",
        description: "Built from this project's milestones, tasks, and budget.",
      });
      void qc.invalidateQueries({ queryKey: ["proposals"] });
      router.push(`/proposals/${data.proposalId}/print`);
    },
    onError: (err: Error) =>
      toast({
        variant: "error",
        title: "Couldn't generate proposal",
        description: err.message,
      }),
  });

  if (query.isLoading) return <LoadingState label="Loading proposals..." />;
  if (query.isError) return <ErrorState label="Unable to load proposals." />;

  // Server already filtered by projectId — no client-side filter needed.
  const proposals = toArray<ProposalRow>(query.data);

  if (proposals.length === 0) {
    return (
      <Card className="py-12 text-center">
        <FileText className="mx-auto mb-3 size-10 text-slate-300" />
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          No proposals yet for this project
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Build one from this project's milestones, tasks, and budget — no extra AI call needed.
        </p>
        <div className="mt-5 flex items-center justify-center gap-3">
          <Button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
          >
            <Sparkles className="mr-2 size-4" />
            {generateMutation.isPending ? "Generating…" : "Generate proposal from this project"}
          </Button>
          <Link
            href="/proposals"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            Or open Proposals <ExternalLink className="size-3" />
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {proposals.map((p) => {
        const tone = STATUS_TONE[p.status ?? "DRAFT"] ?? "neutral";
        return (
          <Link
            key={p.id}
            href={`/proposals/${p.id}/print`}
            className="group block cursor-pointer"
          >
            <Card className="flex h-full flex-col transition hover:border-primary/60 hover:shadow-lg">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Badge tone={tone} size="sm">{p.status ?? "DRAFT"}</Badge>
                  <CardTitle className="mt-2 truncate text-base">
                    {p.projectName ?? "Untitled proposal"}
                  </CardTitle>
                  {p.client?.companyName && (
                    <CardDescription className="mt-0.5 truncate">
                      {p.client.companyName}
                    </CardDescription>
                  )}
                </div>
              </div>

              {p.pricing && (
                <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm font-mono tabular-nums dark:bg-slate-900/40">
                  {p.pricing}
                </div>
              )}

              {p.timeline && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                  <Calendar className="size-3" />
                  {p.timeline}
                </div>
              )}

              {p.createdAt && (
                <div className="mt-3 text-[11px] text-slate-400">
                  Created {new Date(p.createdAt).toLocaleDateString()}
                </div>
              )}

              {/* Explicit CTA — the card itself is clickable but a real
                  button makes the affordance unmissable. */}
              <div className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition group-hover:bg-primary dark:bg-slate-100 dark:text-slate-900">
                <ExternalLink className="size-3.5" />
                Open proposal
              </div>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

