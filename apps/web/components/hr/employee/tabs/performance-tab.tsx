"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useEmployeePerformance } from "@/lib/api/employee-profile";

interface Review {
  id: string;
  // Prisma fields — the previous version of this tab read `rating` /
  // `comments` / `reviewType`, none of which exist on PerformanceReview.
  selfRating?: number | string | null;
  managerRating?: number | string | null;
  finalRating?: number | string | null;
  selfComments?: string | null;
  managerComments?: string | null;
  strengths?: string | null;
  improvementAreas?: string | null;
  status: "NOT_STARTED" | "SELF_REVIEW" | "MANAGER_REVIEW" | "COMPLETED";
  submittedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  reviewer?: { firstName: string; lastName: string } | null;
  cycle?: { name: string; reviewType: string; startDate: string; endDate: string } | null;
}

interface Goal {
  id: string;
  title: string;
  status: string;
  progress?: number | null;
  targetDate?: string | null;
}

function fmtRating(v: number | string | null | undefined): string {
  if (v == null) return "—";
  return Number(v).toFixed(1);
}

export function PerformanceTab({ userId }: { userId: string }) {
  const q = useEmployeePerformance(userId);
  if (q.isLoading) return <LoadingState label="Loading performance..." />;
  if (q.isError || !q.data) return <ErrorState label="Unable to load performance data." />;

  const reviews = (q.data.reviews ?? []) as unknown as Review[];
  const goals = (q.data.goals ?? []) as unknown as Goal[];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <h3 className="mb-3 font-semibold">Reviews ({reviews.length})</h3>
        {reviews.length === 0 ? (
          <p className="text-sm text-slate-500">No reviews recorded.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {reviews.map((r) => {
              const headline = r.cycle?.name ?? "Review";
              const sub = [
                r.cycle?.reviewType,
                r.reviewer ? `By ${r.reviewer.firstName} ${r.reviewer.lastName}` : null,
                new Date(r.completedAt ?? r.submittedAt ?? r.createdAt).toLocaleDateString(),
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={r.id} className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{headline}</div>
                      <div className="text-xs text-slate-500">{sub}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge size="sm" tone="neutral">
                        Self {fmtRating(r.selfRating)}
                      </Badge>
                      <Badge size="sm" tone="neutral">
                        Mgr {fmtRating(r.managerRating)}
                      </Badge>
                      <Badge
                        size="sm"
                        tone={r.finalRating != null ? "info" : "neutral"}
                      >
                        Final {fmtRating(r.finalRating)}
                      </Badge>
                      <Badge
                        size="sm"
                        tone={r.status === "COMPLETED" ? "positive" : "warning"}
                      >
                        {r.status.replace(/_/g, " ")}
                      </Badge>
                    </div>
                  </div>
                  {(r.strengths || r.improvementAreas || r.managerComments) && (
                    <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
                      {r.strengths && (
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Strengths</div>
                          <p className="mt-1 text-slate-700 dark:text-slate-300">{r.strengths}</p>
                        </div>
                      )}
                      {r.improvementAreas && (
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Improve</div>
                          <p className="mt-1 text-slate-700 dark:text-slate-300">{r.improvementAreas}</p>
                        </div>
                      )}
                      {r.managerComments && (
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Manager note</div>
                          <p className="mt-1 text-slate-700 dark:text-slate-300">{r.managerComments}</p>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Card>
        <h3 className="mb-3 font-semibold">Goals ({goals.length})</h3>
        {goals.length === 0 ? (
          <p className="text-sm text-slate-500">No goals set.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {goals.map((g) => (
              <li key={g.id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3 dark:border-slate-800">
                <div>
                  <div className="text-sm font-medium">{g.title}</div>
                  {g.targetDate && (
                    <div className="text-xs text-slate-500">
                      Due {new Date(g.targetDate).toLocaleDateString()}
                      {g.progress != null ? ` · ${g.progress}%` : ""}
                    </div>
                  )}
                </div>
                <Badge tone={g.status === "COMPLETED" ? "positive" : "warning"} size="sm">{g.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
