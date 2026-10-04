"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useEmployeeCareer } from "@/lib/api/employee-profile";
import { useAuthStore } from "@/lib/store/auth-store";
import { CareerEventDialog } from "@/components/hr/employee/career-event-dialog";

const HR_ROLES = ["SUPER_ADMIN", "ADMIN", "HR_MANAGER"];

export function CareerTab({ userId }: { userId: string }) {
  const q = useEmployeeCareer(userId);
  const [open, setOpen] = useState(false);
  const isHr = useAuthStore((s) => (s.user?.roles ?? []).some((r) => HR_ROLES.includes(r)));

  if (q.isLoading) return <LoadingState label="Loading career history..." />;
  if (q.isError || !q.data) return <ErrorState label="Unable to load career data." />;

  const entries = q.data.entries;

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold">Career & status events</h3>
        {isHr && <Button size="sm" onClick={() => setOpen(true)}>+ Log event</Button>}
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-slate-500">No events recorded.</p>
      ) : (
        <ol className="border-l border-slate-200 pl-4 dark:border-slate-800">
          {entries.map((e) => (
            <li key={`${e.kind}-${e.id}`} className="relative mb-4 last:mb-0">
              <div className="absolute -left-[19px] mt-1 h-3 w-3 rounded-full bg-blue-500" />
              <div className="flex items-baseline gap-2">
                <Badge tone="neutral" size="sm">{e.kind}</Badge>
                <span className="text-xs text-slate-400">{new Date(e.effectiveDate).toLocaleDateString()}</span>
              </div>
              <div className="mt-1 text-sm font-medium">{e.summary}</div>
              {e.details && <div className="mt-1 text-xs text-slate-500">{e.details}</div>}
            </li>
          ))}
        </ol>
      )}
      <CareerEventDialog userId={userId} open={open} onOpenChange={setOpen} />
    </Card>
  );
}
