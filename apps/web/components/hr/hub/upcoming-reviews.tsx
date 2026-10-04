"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { HubReviewItem } from "@/lib/api/hr-hub";

export function UpcomingReviews({ reviews }: { reviews: HubReviewItem[] }) {
  return (
    <Card className="p-5">
      <h3 className="mb-3 font-semibold">Recent reviews ({reviews.length})</h3>
      {reviews.length === 0 ? (
        <p className="text-sm text-slate-500">No recent reviews.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {reviews.map((r) => (
            <li
              key={r.reviewId}
              className="flex items-center justify-between rounded border border-slate-100 p-3 dark:border-slate-800"
            >
              <div>
                <Link
                  href={`/hr/employees/${r.userId}`}
                  className="text-sm font-medium text-slate-900 hover:text-blue-600 hover:underline dark:text-white"
                >
                  {r.userName}
                </Link>
                <div className="text-xs text-slate-500">{r.reviewType}</div>
              </div>
              {r.overdue && (
                <Badge tone="destructive" size="sm">
                  Overdue
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
