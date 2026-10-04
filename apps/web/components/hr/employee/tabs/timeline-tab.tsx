"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useEmployeeTimeline } from "@/lib/api/employee-profile";

export function TimelineTab({ userId }: { userId: string }) {
  const q = useEmployeeTimeline(userId);
  if (q.isLoading) return <LoadingState label="Loading timeline..." />;
  if (q.isError || !q.data) return <ErrorState label="Unable to load timeline." />;

  const entries = q.data.entries;

  return (
    <Card>
      <h3 className="mb-4 font-semibold">Activity timeline</h3>
      {entries.length === 0 ? (
        <p className="text-sm text-slate-500">No activity recorded.</p>
      ) : (
        <ol className="border-l border-slate-200 pl-4 dark:border-slate-800">
          {entries.map((e) => (
            <li key={`${e.kind}-${e.id}`} className="relative mb-4 last:mb-0">
              <div className="absolute -left-[19px] mt-1 h-2.5 w-2.5 rounded-full bg-slate-400" />
              <div className="flex items-baseline gap-2">
                <Badge tone="neutral" size="sm">{e.kind}</Badge>
                <span className="text-xs text-slate-400">{new Date(e.at).toLocaleString()}</span>
              </div>
              <div className="mt-1 text-sm">{e.summary}</div>
              {e.details && <div className="mt-1 text-xs text-slate-500">{e.details}</div>}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
