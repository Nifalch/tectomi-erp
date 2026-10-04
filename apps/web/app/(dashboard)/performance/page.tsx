"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { ListPageLayout } from "@/components/layouts/list-page-layout";
import { DataTable } from "@/components/ui/data-table";
import { Tabs } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { StarRating } from "@/components/ui/star-rating";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { createActionsColumn, type RowAction } from "@/components/ui/data-table-row-actions";
import {
  useReviewCycles, useReviews, useMyReviewsToSelfReview, useMyReviewsToReview,
} from "@/lib/api/hooks";
import {
  useCreateReviewCycle, useActivateReviewCycle, useCompleteReviewCycle,
  useSubmitSelfReview, useSubmitManagerReview,
} from "@/lib/api/mutations";
import { useAuthStore } from "@/lib/store/auth-store";
import { toArray } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";

interface Cycle {
  id: string;
  name: string;
  type?: string;
  startDate?: string;
  endDate?: string;
  status: string;
  reviewCount?: number;
}

interface Review {
  id: string;
  status: string;
  employee?: { firstName?: string; lastName?: string };
  user?: { firstName?: string; lastName?: string };
  cycle?: { name?: string };
  selfRating?: number;
  managerRating?: number;
  finalRating?: number;
}

export default function PerformancePage() {
  const role = useAuthStore((s) => s.user?.roles[0] ?? "EMPLOYEE");
  const isHr = ["SUPER_ADMIN", "ADMIN", "HR_MANAGER"].includes(role);

  const [tab, setTab] = useState("cycles");
  const [createCycleOpen, setCreateCycleOpen] = useState(false);

  const cyclesQuery = useReviewCycles();
  const selfReviewsQuery = useMyReviewsToSelfReview();
  const toReviewQuery = useMyReviewsToReview();
  const allReviewsQuery = useReviews();

  const createCycle = useCreateReviewCycle();
  const activateCycle = useActivateReviewCycle();
  const completeCycle = useCompleteReviewCycle();

  const cycles = toArray<Cycle>(cyclesQuery.data);
  const selfReviews = toArray<Review>(selfReviewsQuery.data);
  const toReview = toArray<Review>(toReviewQuery.data);
  const allReviews = toArray<Review>(allReviewsQuery.data);

  const cycleActions: RowAction<Cycle>[] = [
    { label: "Activate", onClick: (row) => activateCycle.mutate(row.id) },
    { label: "Complete", onClick: (row) => completeCycle.mutate(row.id) },
  ];

  const cycleColumns: ColumnDef<Cycle, unknown>[] = [
    { accessorKey: "name", header: "Cycle" },
    { accessorKey: "type", header: "Type", cell: ({ row }) => row.original.type ?? "—" },
    {
      accessorKey: "startDate", header: "Dates",
      cell: ({ row }) => {
        const s = row.original.startDate ? new Date(row.original.startDate).toLocaleDateString() : "—";
        const e = row.original.endDate ? new Date(row.original.endDate).toLocaleDateString() : "—";
        return `${s} → ${e}`;
      },
    },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} dot size="sm" /> },
    { accessorKey: "reviewCount", header: "Reviews", cell: ({ row }) => row.original.reviewCount ?? 0 },
    createActionsColumn(cycleActions),
  ];

  const tabs = [
    { key: "cycles", label: "Cycles", count: cycles.length },
    { key: "my", label: "My Reviews", count: selfReviews.length },
    { key: "to-review", label: "To Review", count: toReview.length },
    ...(isHr ? [{ key: "all", label: "All Reviews", count: allReviews.length }] : []),
  ];

  if (cyclesQuery.isLoading) return <LoadingState label="Loading performance..." />;
  if (cyclesQuery.isError) return <ErrorState label="Unable to load performance." />;

  return (
    <ListPageLayout
      module="hr"
      title="Performance"
      description="Performance cycles, self-reviews, and 360 feedback."
      primaryAction={tab === "cycles" && isHr ? { label: "New Cycle", icon: <Plus className="mr-1 size-4" />, onClick: () => setCreateCycleOpen(true) } : undefined}
    >
      <Tabs tabs={tabs} activeTab={tab} onTabChange={setTab} />

      {tab === "cycles" && (
        <>
          {/* Hint when there are cycles but none are ACTIVE yet — until HR
              clicks "Activate" no PerformanceReview rows exist, so My
              Reviews / To Review / All Reviews stay at zero. */}
          {isHr && cycles.some((c) => c.status === "DRAFT") && !cycles.some((c) => c.status === "ACTIVE") && (
            <Card className="mb-3 border border-amber-200 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/30">
              <div className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                Cycle is in draft — activate it to start collecting reviews.
              </div>
              <p className="mt-1 text-xs text-amber-800/80 dark:text-amber-200/80">
                Activating a cycle creates one review row per active employee, assigns the manager as reviewer,
                and sends notifications. Until then, employees won&apos;t see anything in their &quot;My Reviews&quot; tab.
              </p>
            </Card>
          )}
          <DataTable
            columns={cycleColumns} data={cycles} searchPlaceholder="Search cycles..." moduleColor="hr"
            emptyState={{ title: "No review cycles", description: isHr ? "Click \"New Cycle\" to create one. Activating it spawns reviews for every active employee." : "Your HR team hasn't started a review cycle yet." }}
          />
        </>
      )}

      {tab === "my" && (
        <div className="grid gap-4 md:grid-cols-2">
          {selfReviews.length === 0 ? (
            <Card className="md:col-span-2">
              <div className="text-sm font-semibold">No self-reviews pending</div>
              <p className="mt-1 text-xs text-slate-500">
                A self-review only appears here when HR activates a review cycle and you&apos;re an active employee on it.
                Until then, there&apos;s nothing for you to fill in.
              </p>
            </Card>
          ) : selfReviews.map((r) => (
            <SelfReviewCard key={r.id} review={r} />
          ))}
        </div>
      )}

      {tab === "to-review" && (() => {
        const ready = toReview.filter((r) => r.status === "MANAGER_REVIEW");
        const waiting = toReview.filter((r) => r.status === "SELF_REVIEW");
        return (
          <div className="space-y-6">
            {toReview.length === 0 ? (
              <Card>
                <div className="text-sm font-semibold">No reviews assigned to you</div>
                <p className="mt-1 text-xs text-slate-500">
                  Reviews will land here once HR activates a cycle and you&apos;re named as the reviewer for at least one employee.
                </p>
              </Card>
            ) : (
              <>
                <section>
                  <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Ready for your review
                    <Badge tone="warning" size="sm">{ready.length}</Badge>
                  </div>
                  {ready.length === 0 ? (
                    <Card>
                      <p className="text-xs text-slate-500">
                        No reviews are ready right now. Reviews move here once the employee submits their self-review.
                      </p>
                    </Card>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                      {ready.map((r) => <ManagerReviewCard key={r.id} review={r} />)}
                    </div>
                  )}
                </section>

                {waiting.length > 0 && (
                  <section>
                    <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      Waiting on self-review
                      <Badge tone="info" size="sm">{waiting.length}</Badge>
                    </div>
                    <p className="mb-3 text-xs text-slate-500">
                      These employees haven&apos;t submitted their self-review yet. Ping them — or proceed with your review now if you don&apos;t want to wait.
                    </p>
                    <div className="grid gap-4 md:grid-cols-2">
                      {waiting.map((r) => <ManagerReviewCard key={r.id} review={r} />)}
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        );
      })()}

      {tab === "all" && isHr && (
        <DataTable
          columns={[
            {
              accessorKey: "employee", header: "Employee",
              cell: ({ row }) => {
                const u = row.original.employee ?? row.original.user;
                return u ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() : "—";
              },
            },
            { accessorKey: "cycle", header: "Cycle", cell: ({ row }) => row.original.cycle?.name ?? "—" },
            { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} dot size="sm" /> },
            {
              accessorKey: "selfRating", header: "Self",
              cell: ({ row }) => row.original.selfRating != null
                ? <StarRating value={Number(row.original.selfRating)} readOnly size={14} />
                : <span className="text-xs text-slate-400">—</span>,
            },
            {
              accessorKey: "managerRating", header: "Manager",
              cell: ({ row }) => row.original.managerRating != null
                ? <StarRating value={Number(row.original.managerRating)} readOnly size={14} />
                : <span className="text-xs text-slate-400">—</span>,
            },
            {
              accessorKey: "finalRating", header: "Final",
              cell: ({ row }) => row.original.finalRating != null
                ? <StarRating value={Number(row.original.finalRating)} readOnly size={14} showValue />
                : <span className="text-xs text-slate-400">—</span>,
            },
            {
              id: "open", header: "", cell: ({ row }) => (
                <Link href={`/performance/reviews/${row.original.id}`} className="text-primary text-xs font-medium">Open</Link>
              ),
            },
          ] as ColumnDef<Review, unknown>[]}
          data={allReviews}
          searchPlaceholder="Search reviews..."
          moduleColor="hr"
        />
      )}

      <CreateCycleDialog
        open={createCycleOpen}
        onClose={() => setCreateCycleOpen(false)}
        onSave={(data) => createCycle.mutate(data, { onSuccess: () => setCreateCycleOpen(false) })}
        saving={createCycle.isPending}
      />
    </ListPageLayout>
  );
}

function CreateCycleDialog({ open, onClose, onSave, saving }: {
  open: boolean; onClose: () => void; onSave: (data: Record<string, unknown>) => void; saving: boolean;
}) {
  const [name, setName] = useState("");
  // Local state is renamed reviewType to match the API DTO field name —
  // previously the form posted `type` which the strict ValidationPipe
  // rejected with "property type should not exist".
  const [reviewType, setReviewType] = useState("QUARTERLY");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();

  const submit = () => {
    onSave({ name, reviewType, startDate: startDate?.toISOString(), endDate: endDate?.toISOString() });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>New Review Cycle</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <FormField label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Q1 2026 Review" /></FormField>
          <FormField label="Type">
            <Select value={reviewType} onValueChange={setReviewType} options={[
              { value: "MONTHLY", label: "Monthly" },
              { value: "QUARTERLY", label: "Quarterly" },
              { value: "HALF_YEARLY", label: "Half-Yearly" },
              { value: "ANNUAL", label: "Annual" },
            ]} />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Start Date"><DatePicker value={startDate} onChange={setStartDate} /></FormField>
            <FormField label="End Date"><DatePicker value={endDate} onChange={setEndDate} /></FormField>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={submit} disabled={saving || !name}>{saving ? "Creating..." : "Create"}</Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SelfReviewCard({ review }: { review: Review }) {
  const [open, setOpen] = useState(false);
  // Default to 0 (unrated) so the user must deliberately pick a star.
  // Previously this defaulted to 3, which silently pre-rated everyone "average".
  const [selfRating, setSelfRating] = useState(0);
  const [selfComments, setSelfComments] = useState("");
  const [strengths, setStrengths] = useState("");
  const [improvementAreas, setImprovementAreas] = useState("");
  const submit = useSubmitSelfReview(review.id);

  const onSubmit = () => {
    submit.mutate(
      { selfRating, selfComments, strengths, improvementAreas },
      { onSuccess: () => setOpen(false) },
    );
  };

  const progressValue =
    review.status === "COMPLETED" ? 100 :
    review.status === "MANAGER_REVIEW" ? 66 :
    review.status === "SELF_REVIEW" ? 33 : 10;

  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold">{review.cycle?.name ?? "Review"}</div>
          <Badge tone="info" size="sm" className="mt-1">{review.status.replace(/_/g, " ")}</Badge>
        </div>
        {/* Show the saved final rating once the review is closed. */}
        {review.finalRating != null && review.status === "COMPLETED" && (
          <StarRating value={Number(review.finalRating)} readOnly showValue />
        )}
      </div>
      <div className="mt-3">
        <Progress value={progressValue} />
      </div>
      {/* Already-submitted self rating, shown while waiting for manager. */}
      {review.selfRating != null && review.status !== "SELF_REVIEW" && (
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <span>Your self-rating:</span>
          <StarRating value={Number(review.selfRating)} readOnly showValue />
        </div>
      )}
      {review.status === "SELF_REVIEW" && (
        <Button size="sm" className="mt-4" onClick={() => setOpen(true)}>Start Self-Review</Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>Self-Review</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <FormField label="How would you rate your own performance?">
              <StarRating
                value={selfRating}
                onChange={setSelfRating}
                showLabel
                showValue
              />
            </FormField>
            <FormField label="Self Comments"><TextArea value={selfComments} onChange={(e) => setSelfComments(e.target.value)} rows={3} /></FormField>
            <FormField label="Strengths"><TextArea value={strengths} onChange={(e) => setStrengths(e.target.value)} rows={3} /></FormField>
            <FormField label="Improvement Areas"><TextArea value={improvementAreas} onChange={(e) => setImprovementAreas(e.target.value)} rows={3} /></FormField>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                onClick={onSubmit}
                disabled={submit.isPending || selfRating === 0 || !selfComments.trim()}
              >
                {submit.isPending ? "Submitting..." : "Submit"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ManagerReviewCard({ review }: { review: Review }) {
  const [open, setOpen] = useState(false);
  // Default to 0 (unrated) so the manager has to deliberately pick a value
  // instead of accidentally submitting a silent "3/5" baseline.
  const [managerRating, setManagerRating] = useState(0);
  const [managerComments, setManagerComments] = useState("");
  const [finalRating, setFinalRating] = useState(0);
  const [goalsForNext, setGoalsForNext] = useState("");
  const submit = useSubmitManagerReview(review.id);

  const onSubmit = () => {
    submit.mutate(
      { managerRating, managerComments, finalRating, goalsForNext },
      { onSuccess: () => setOpen(false) },
    );
  };

  const employee = review.employee ?? review.user;

  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold">{employee ? `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim() : "—"}</div>
          <div className="text-xs text-slate-500">{review.cycle?.name ?? ""}</div>
        </div>
        {review.status === "MANAGER_REVIEW" ? (
          <Badge tone="warning" size="sm">Ready for your review</Badge>
        ) : (
          <Badge tone="info" size="sm">Waiting on self-review</Badge>
        )}
      </div>
      {/* Surface the employee's self-rating so the manager has context
          before writing their own assessment. */}
      {review.selfRating != null && (
        <div className="mt-3 flex items-center justify-between rounded-md border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800/30">
          <span className="text-slate-500">Employee self-rated</span>
          <StarRating value={Number(review.selfRating)} readOnly showValue />
        </div>
      )}
      {review.status === "SELF_REVIEW" && review.selfRating == null && (
        <p className="mt-3 rounded-md border border-slate-200 bg-slate-50/60 px-3 py-2 text-[11px] leading-relaxed text-slate-500 dark:border-slate-700 dark:bg-slate-800/30">
          The employee hasn&apos;t submitted their self-review yet. You can wait, ping them, or submit your review now — the system won&apos;t block you.
        </p>
      )}
      <Button size="sm" className="mt-4" onClick={() => setOpen(true)}>
        {review.status === "MANAGER_REVIEW" ? "Submit Review" : "Review Anyway"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>Manager Review</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <FormField label="Your assessment of this employee's performance">
              <StarRating
                value={managerRating}
                onChange={setManagerRating}
                showLabel
                showValue
              />
            </FormField>
            <FormField label="Manager Comments"><TextArea value={managerComments} onChange={(e) => setManagerComments(e.target.value)} rows={3} /></FormField>
            <FormField label="Final rating (this is what counts toward the employee's score)">
              <StarRating
                value={finalRating}
                onChange={setFinalRating}
                showLabel
                showValue
              />
            </FormField>
            <FormField label="Goals for Next Cycle"><TextArea value={goalsForNext} onChange={(e) => setGoalsForNext(e.target.value)} rows={3} /></FormField>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                onClick={onSubmit}
                disabled={submit.isPending || managerRating === 0 || finalRating === 0 || !managerComments.trim()}
              >
                {submit.isPending ? "Submitting..." : "Submit"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
