"use client";

import { Card } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useOrgChart } from "@/lib/api/hr-hub";
import { OrgNode } from "./org-node";

export function OrgTree() {
  const q = useOrgChart();
  if (q.isLoading) return <LoadingState label="Loading org chart..." />;
  if (q.isError || !q.data) return <ErrorState label="Unable to load org chart." />;
  if (q.data.roots.length === 0)
    return <Card className="p-5 text-sm text-slate-500">No employees yet.</Card>;

  return (
    <Card className="p-5">
      <ul>
        {q.data.roots.map((root) => (
          <OrgNode key={root.userId} node={root} />
        ))}
      </ul>
    </Card>
  );
}
