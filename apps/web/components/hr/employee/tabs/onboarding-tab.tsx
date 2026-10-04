"use client";

import { Card } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useEmployeeOnboarding } from "@/lib/api/employee-profile";

export function OnboardingTab({ userId }: { userId: string }) {
  const q = useEmployeeOnboarding(userId);
  if (q.isLoading) return <LoadingState label="Loading onboarding..." />;
  if (q.isError || !q.data) return <ErrorState label="Unable to load onboarding." />;

  const checklists = q.data.checklists as Array<{
    id: string; title: string; description: string | null;
    items: Array<{ id: string; title: string; completed: boolean }>
  }>;

  if (checklists.length === 0) {
    return <Card className="text-sm text-slate-500">No onboarding checklist assigned.</Card>;
  }

  return (
    <div className="flex flex-col gap-4">
      {checklists.map((cl) => {
        const total = cl.items.length;
        const done = cl.items.filter((i) => i.completed).length;
        return (
          <Card key={cl.id}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{cl.title}</h3>
              <span className="text-xs text-slate-500">{done}/{total}</span>
            </div>
            {cl.description && <p className="mt-1 text-sm text-slate-500">{cl.description}</p>}
            <ul className="mt-3 flex flex-col gap-1">
              {cl.items.map((it) => (
                <li key={it.id} className="flex items-center gap-2 text-sm">
                  <span className={it.completed ? "text-emerald-600" : "text-slate-400"}>{it.completed ? "✓" : "○"}</span>
                  <span className={it.completed ? "line-through text-slate-400" : "text-slate-700 dark:text-slate-300"}>{it.title}</span>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
