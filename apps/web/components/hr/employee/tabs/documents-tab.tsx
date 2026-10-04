"use client";

import { Card } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useEmployeeDocuments } from "@/lib/api/employee-profile";

export function DocumentsTab({ userId }: { userId: string }) {
  const q = useEmployeeDocuments(userId);
  if (q.isLoading) return <LoadingState label="Loading documents..." />;
  if (q.isError || !q.data) return <ErrorState label="Unable to load documents." />;

  const docs = q.data.documents as Array<{ id: string; title: string; fileUrl: string; createdAt: string }>;

  return (
    <Card>
      <h3 className="mb-3 font-semibold">Documents ({docs.length})</h3>
      {docs.length === 0 ? (
        <p className="text-sm text-slate-500">No documents uploaded. (Upload UI ships in Plan 2C.)</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3 dark:border-slate-800">
              <div>
                <a href={d.fileUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-blue-700 hover:underline dark:text-blue-400">
                  {d.title}
                </a>
                <div className="text-xs text-slate-500">{new Date(d.createdAt).toLocaleDateString()}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
