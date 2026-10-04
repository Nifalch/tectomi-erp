"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import type { HubOnboardingItem } from "@/lib/api/hr-hub";

export function OnboardingQueue({ items }: { items: HubOnboardingItem[] }) {
  return (
    <Card className="p-5">
      <h3 className="mb-3 font-semibold">Active onboarding ({items.length})</h3>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">No active onboarding.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((it) => (
            <li
              key={`${it.userId}-${it.checklistTitle}`}
              className="rounded border border-slate-100 p-3 dark:border-slate-800"
            >
              <div className="flex items-center justify-between">
                <Link
                  href={`/hr/employees/${it.userId}`}
                  className="text-sm font-medium text-slate-900 hover:text-blue-600 hover:underline dark:text-white"
                >
                  {it.userName}
                </Link>
                <span className="text-xs text-slate-500">
                  {it.doneCount}/{it.totalCount}
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-500">{it.checklistTitle}</div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
