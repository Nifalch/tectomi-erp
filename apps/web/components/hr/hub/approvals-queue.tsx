"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { HubPendingApproval } from "@/lib/api/hr-hub";
import { useUpdateLeaveStatus } from "@/lib/api/mutations";

export function ApprovalsQueue({ items }: { items: HubPendingApproval[] }) {
  return (
    <Card className="p-5">
      <h3 className="mb-3 font-semibold">Pending approvals ({items.length})</h3>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">Nothing waiting on you.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((it) => (
            <ApprovalRow key={`${it.kind}-${it.id}`} item={it} />
          ))}
        </ul>
      )}
    </Card>
  );
}

/**
 * Per-row approve/reject. Each row owns its own mutation instance so an
 * in-flight approval on one leave doesn't freeze the rest of the queue —
 * previously, the shared mutation at the panel level disabled every button
 * across every row until the first request settled.
 */
function ApprovalRow({ item }: { item: HubPendingApproval }) {
  const m = useUpdateLeaveStatus();
  const [pendingAction, setPendingAction] = useState<"APPROVED" | "REJECTED" | null>(null);

  const trigger = (status: "APPROVED" | "REJECTED") => {
    setPendingAction(status);
    m.mutate({ id: item.id, status }, { onSettled: () => setPendingAction(null) });
  };

  return (
    <li className="flex items-center justify-between rounded border border-slate-100 p-3 dark:border-slate-800">
      <div>
        <Link
          href={`/hr/employees/${item.userId}`}
          className="text-sm font-medium text-slate-900 hover:text-blue-600 hover:underline dark:text-white"
        >
          {item.userName}
        </Link>
        <div className="text-xs text-slate-500">{item.summary}</div>
      </div>
      <div className="flex items-center gap-2">
        <Badge tone="warning" size="sm">
          {item.kind}
        </Badge>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => trigger("APPROVED")}
          disabled={m.isPending}
        >
          {pendingAction === "APPROVED" ? "Approving…" : "Approve"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => trigger("REJECTED")}
          disabled={m.isPending}
        >
          {pendingAction === "REJECTED" ? "Rejecting…" : "Reject"}
        </Button>
      </div>
    </li>
  );
}
