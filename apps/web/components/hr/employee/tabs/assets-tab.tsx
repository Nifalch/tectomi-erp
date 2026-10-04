"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useEmployeeAssets } from "@/lib/api/employee-profile";

export function AssetsTab({ userId }: { userId: string }) {
  const q = useEmployeeAssets(userId);
  if (q.isLoading) return <LoadingState label="Loading assets..." />;
  if (q.isError || !q.data) return <ErrorState label="Unable to load assets." />;

  const assets = q.data.assets as Array<{ id: string; name: string; category: string; serialNumber?: string; assignedAt?: string; status: string }>;

  return (
    <Card>
      <h3 className="mb-3 font-semibold">Assigned assets ({assets.length})</h3>
      {assets.length === 0 ? (
        <p className="text-sm text-slate-500">No assets assigned.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {assets.map((a) => (
            <li key={a.id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3 dark:border-slate-800">
              <div>
                <div className="text-sm font-medium">{a.name}</div>
                <div className="text-xs text-slate-500">
                  {a.category}
                  {a.serialNumber ? ` · SN ${a.serialNumber}` : ""}
                  {a.assignedAt ? ` · since ${new Date(a.assignedAt).toLocaleDateString()}` : ""}
                </div>
              </div>
              <Badge tone="info" size="sm">{a.status}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
