"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import type { HubAnniversary } from "@/lib/api/hr-hub";

export function Celebrations({ anniversaries }: { anniversaries: HubAnniversary[] }) {
  return (
    <Card className="p-5">
      <h3 className="mb-3 font-semibold">Anniversaries ({anniversaries.length})</h3>
      {anniversaries.length === 0 ? (
        <p className="text-sm text-slate-500">No milestone anniversaries this week.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {anniversaries.map((a) => (
            <li
              key={a.userId}
              className="flex items-center justify-between rounded border border-slate-100 p-3 dark:border-slate-800"
            >
              <div>
                <Link
                  href={`/hr/employees/${a.userId}`}
                  className="text-sm font-medium text-slate-900 hover:text-blue-600 hover:underline dark:text-white"
                >
                  {a.userName}
                </Link>
                <div className="text-xs text-slate-500">
                  {a.yearsAt} year{a.yearsAt === 1 ? "" : "s"} on {new Date(a.joinDate).toLocaleDateString()}
                </div>
              </div>
              <span className="text-xs text-slate-400">
                {a.daysAway === 0 ? "today" : a.daysAway === 1 ? "tomorrow" : `${a.daysAway} days`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
