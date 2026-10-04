"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { useOrgChart } from "@/lib/api/hr-hub";

export function OrgChartPreview() {
  const q = useOrgChart();
  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold">Org chart</h3>
        <Link href="/hr/org-chart" className="text-xs text-blue-600 hover:underline">
          View full →
        </Link>
      </div>
      {q.isLoading ? (
        <p className="mt-3 text-sm text-slate-500">Loading...</p>
      ) : q.isError || !q.data ? (
        <p className="mt-3 text-sm text-slate-400">Unable to load the org chart right now.</p>
      ) : q.data.roots.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">No employees yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1">
          {q.data.roots.slice(0, 4).map((root) => (
            <li key={root.userId} className="text-sm">
              <Link href={`/hr/employees/${root.userId}`} className="font-medium hover:underline">
                {root.name}
              </Link>
              <span className="ml-2 text-xs text-slate-500">
                {root.designation} ({root.reports.length} report{root.reports.length === 1 ? "" : "s"})
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
