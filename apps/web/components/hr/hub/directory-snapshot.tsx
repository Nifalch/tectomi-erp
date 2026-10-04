"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import type { HubResponse } from "@/lib/api/hr-hub";

export function DirectorySnapshot({ snapshot }: { snapshot: HubResponse["directorySnapshot"] }) {
  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold">Recent hires</h3>
        <Link href="/hr/employees" className="text-xs text-blue-600 hover:underline">
          View all {snapshot.total} →
        </Link>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {snapshot.recentHires.length === 0 ? (
          <p className="text-sm text-slate-500">No recent hires.</p>
        ) : (
          snapshot.recentHires.map((h) => {
            // Skip empty designation/department in the meta line so we
            // don't render "·  · joined …" when a fresh hire hasn't had
            // those fields filled in yet.
            const metaParts = [
              h.designation?.trim() || null,
              h.department?.trim() || null,
              `joined ${new Date(h.joinDate).toLocaleDateString()}`,
            ].filter(Boolean);
            return (
              <li
                key={h.userId}
                className="rounded border border-slate-100 p-3 dark:border-slate-800"
              >
                <Link href={`/hr/employees/${h.userId}`} className="block">
                  <div className="text-sm font-medium">{h.userName}</div>
                  <div className="text-xs text-slate-500">{metaParts.join(" · ")}</div>
                </Link>
              </li>
            );
          })
        )}
      </ul>
    </Card>
  );
}
