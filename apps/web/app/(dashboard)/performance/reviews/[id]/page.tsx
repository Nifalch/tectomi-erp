"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form";
import { TextArea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { StarRating } from "@/components/ui/star-rating";
import { LoadingState, ErrorState } from "@/components/ui/state";
import { ModuleHeader } from "@/components/layout/module-header";
import { useReview, useFeedback360 } from "@/lib/api/hooks";
import { useSubmit360Feedback } from "@/lib/api/mutations";
import { toArray } from "@/lib/utils";

interface ReviewDetail {
  id: string;
  status: string;
  employee?: { firstName?: string; lastName?: string; email?: string; designation?: string };
  user?: { firstName?: string; lastName?: string; email?: string };
  cycle?: { name?: string; type?: string; startDate?: string; endDate?: string };
  selfRating?: number;
  selfComments?: string;
  strengths?: string;
  improvementAreas?: string;
  managerRating?: number;
  managerComments?: string;
  finalRating?: number;
  goalsForNext?: string;
}

interface Feedback {
  id: string;
  from?: { firstName?: string; lastName?: string };
  rating?: number;
  comments?: string;
  createdAt?: string;
}

function RatingBar({ label, value, highlight = false }: { label: string; value?: number; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col">
        <span className={`text-sm ${highlight ? "font-semibold text-slate-800 dark:text-slate-100" : "text-slate-600 dark:text-slate-400"}`}>
          {label}
        </span>
        {highlight && (
          <span className="text-[10px] uppercase tracking-[0.18em] text-amber-600 dark:text-amber-400">
            Counts toward the score
          </span>
        )}
      </div>
      {value != null ? (
        <StarRating value={Number(value)} readOnly showValue />
      ) : (
        <span className="text-xs italic text-slate-400">Not yet submitted</span>
      )}
    </div>
  );
}

export default function ReviewDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const reviewQuery = useReview(id);
  const feedbackQuery = useFeedback360(id);
  const submitFeedback = useSubmit360Feedback(id);

  // Start at 0 so the user must deliberately pick a star. Avoids silent
  // "3/5 average" submissions where the reviewer never touched the widget.
  const [rating, setRating] = useState(0);
  const [comments, setComments] = useState("");
  // 360 feedback requires the reviewer's relationship to the subject — peer,
  // subordinate, manager, or external. The API rejects submissions without
  // it. Default to "PEER" since that's the most common 360 source.
  const [relationship, setRelationship] = useState<"PEER" | "SUBORDINATE" | "MANAGER" | "EXTERNAL">("PEER");

  if (reviewQuery.isLoading) return <LoadingState label="Loading review..." />;
  if (reviewQuery.isError || !reviewQuery.data) return <ErrorState label="Unable to load review." />;

  const review = reviewQuery.data as unknown as ReviewDetail;
  const feedback = toArray<Feedback>(feedbackQuery.data);
  const employee = review.employee ?? review.user;

  const onSubmitFeedback = () => {
    submitFeedback.mutate(
      { rating, comments, relationship },
      { onSuccess: () => { setRating(0); setComments(""); setRelationship("PEER"); } },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <ModuleHeader
        module="hr"
        title="Performance Review"
        description={employee ? `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim() : ""}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle className="mb-3 text-sm uppercase tracking-wider text-slate-400">Employee</CardTitle>
          <div className="font-semibold">{employee ? `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim() : "—"}</div>
          <div className="text-xs text-slate-500">{employee?.email ?? ""}</div>
          {review.employee?.designation && <Badge size="sm" tone="hr" className="mt-2">{review.employee.designation}</Badge>}
        </Card>
        <Card>
          <CardTitle className="mb-3 text-sm uppercase tracking-wider text-slate-400">Cycle</CardTitle>
          <div className="font-semibold">{review.cycle?.name ?? "—"}</div>
          <div className="text-xs text-slate-500">{review.cycle?.type ?? ""}</div>
          <StatusBadge status={review.status} dot size="sm" className="mt-2" />
        </Card>
      </div>

      <Card>
        <CardTitle className="mb-1">Ratings</CardTitle>
        <p className="mb-4 text-xs text-slate-500">
          Self and manager ratings are recorded for context. The Final rating is the only one that feeds the employee&apos;s rolling performance score.
        </p>
        <div className="space-y-3">
          <RatingBar label="Self assessment" value={review.selfRating} />
          <RatingBar label="Manager assessment" value={review.managerRating} />
          <RatingBar label="Final rating" value={review.finalRating} highlight />
        </div>
      </Card>

      <Card>
        <CardTitle className="mb-3">Self-Review</CardTitle>
        {review.selfComments || review.strengths || review.improvementAreas ? (
          <div className="space-y-3 text-sm">
            {review.selfComments && <div><div className="text-xs text-slate-500 uppercase">Comments</div>{review.selfComments}</div>}
            {review.strengths && <div><div className="text-xs text-slate-500 uppercase">Strengths</div>{review.strengths}</div>}
            {review.improvementAreas && <div><div className="text-xs text-slate-500 uppercase">Improvement Areas</div>{review.improvementAreas}</div>}
          </div>
        ) : <div className="text-sm text-slate-400">Not submitted yet.</div>}
      </Card>

      <Card>
        <CardTitle className="mb-3">Manager Review</CardTitle>
        {review.managerComments || review.goalsForNext ? (
          <div className="space-y-3 text-sm">
            {review.managerComments && <div><div className="text-xs text-slate-500 uppercase">Comments</div>{review.managerComments}</div>}
            {review.goalsForNext && <div><div className="text-xs text-slate-500 uppercase">Goals for Next</div>{review.goalsForNext}</div>}
          </div>
        ) : <div className="text-sm text-slate-400">Not submitted yet.</div>}
      </Card>

      <Card>
        <CardTitle className="mb-3">360 Feedback</CardTitle>
        <div className="space-y-3">
          {feedback.length === 0 ? <div className="text-sm text-slate-400">No feedback yet.</div> : feedback.map((f) => (
            <div key={f.id} className="rounded-xl border border-border p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{f.from ? `${f.from.firstName ?? ""} ${f.from.lastName ?? ""}`.trim() : "Anonymous"}</span>
                {f.rating != null && <StarRating value={Number(f.rating)} readOnly showValue />}
              </div>
              {f.comments && <p className="mt-1 text-slate-600">{f.comments}</p>}
            </div>
          ))}
        </div>

        <div className="mt-6 space-y-3 border-t border-border pt-4">
          <FormField label="Your relationship to this person">
            <Select
              value={relationship}
              onValueChange={(v) => setRelationship(v as typeof relationship)}
              options={[
                { value: "PEER", label: "Peer (same level / team)" },
                { value: "SUBORDINATE", label: "Subordinate (they manage me)" },
                { value: "MANAGER", label: "Manager (I manage them)" },
                { value: "EXTERNAL", label: "External (client / vendor / partner)" },
              ]}
            />
          </FormField>
          <FormField label="Your rating">
            <StarRating value={rating} onChange={setRating} showLabel showValue />
          </FormField>
          <FormField label="Your Comments">
            <TextArea value={comments} onChange={(e) => setComments(e.target.value)} rows={3} />
          </FormField>
          <Button
            onClick={onSubmitFeedback}
            disabled={submitFeedback.isPending || rating === 0 || !comments.trim()}
          >
            {submitFeedback.isPending ? "Submitting..." : "Submit Feedback"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
