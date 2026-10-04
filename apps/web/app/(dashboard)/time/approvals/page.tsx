"use client";

import Link from "next/link";
import { ListPageLayout } from "@/components/layouts/list-page-layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useTimesheets } from "@/lib/api/hooks";
import {
  useApproveTimesheet,
  useRejectTimesheet,
} from "@/lib/api/mutations";
import { useAuthStore } from "@/lib/store/auth-store";
import { toArray } from "@/lib/utils";

interface Timesheet {
  id: string;
  weekStart: string;
  weekEnd?: string;
  totalHours?: number;
  status: string;
  user?: { id?: string; firstName?: string; lastName?: string; email?: string };
}

const ALLOWED_ROLES = ["SUPER_ADMIN", "ADMIN", "PROJECT_MANAGER", "HR_MANAGER"];

export default function TimeApprovalsPage() {
  const roles = useAuthStore((s) => s.user?.roles ?? []);
  const hasAccess = roles.some((r) => ALLOWED_ROLES.includes(r));

  // Show submitted (pending) weekly timesheets — replaces the old entry-level
  // queue. A single click approves the whole week.
  const query = useTimesheets({ status: "SUBMITTED" });

  if (!hasAccess) {
    return (
      <ListPageLayout
        module="time"
        title="Approvals"
        description="Review and approve weekly timesheets."
      >
        <Card>
          <div className="py-10 text-center text-sm text-slate-500">
            403 · You do not have access to this page.
          </div>
        </Card>
      </ListPageLayout>
    );
  }

  if (query.isLoading) return <LoadingState label="Loading approvals..." />;
  if (query.isError) return <ErrorState label="Unable to load approvals." />;

  const sheets = toArray<Timesheet>(query.data);

  return (
    <ListPageLayout
      module="time"
      title="Approvals"
      description="Review and approve weekly timesheets submitted by the team."
    >
      <p className="-mt-2 mb-3 text-xs text-slate-500">
        Each row is a full week of an employee's logged time. Approving signs off
        the entire week for payroll and billing. Click "View" to inspect entries
        before approving.
      </p>

      <Card>
        {sheets.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">
            No timesheets waiting for approval.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border/60 text-xs text-slate-500">
                <tr>
                  <th className="py-2 pr-3 text-left font-medium">Employee</th>
                  <th className="py-2 pr-3 text-left font-medium">Week</th>
                  <th className="py-2 pr-3 text-left font-medium">Hours</th>
                  <th className="py-2 pr-3 text-left font-medium">Status</th>
                  <th className="py-2 pr-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sheets.map((s) => (
                  <ApprovalRow key={s.id} ts={s} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </ListPageLayout>
  );
}

function ApprovalRow({ ts }: { ts: Timesheet }) {
  const approve = useApproveTimesheet(ts.id);
  const reject = useRejectTimesheet(ts.id);

  const name = ts.user
    ? `${ts.user.firstName ?? ""} ${ts.user.lastName ?? ""}`.trim() || ts.user.email
    : "—";
  const weekStart = new Date(ts.weekStart);
  const weekEnd = ts.weekEnd ? new Date(ts.weekEnd) : new Date(weekStart.getTime() + 6 * 86400000);

  return (
    <tr className="border-b border-border/30 last:border-0">
      <td className="py-2 pr-3 font-medium text-slate-700 dark:text-slate-200">{name}</td>
      <td className="py-2 pr-3 text-xs text-slate-500 tabular-nums">
        {weekStart.toLocaleDateString()} – {weekEnd.toLocaleDateString()}
      </td>
      <td className="py-2 pr-3 tabular-nums">
        {ts.totalHours != null ? `${Number(ts.totalHours).toFixed(1)}h` : "—"}
      </td>
      <td className="py-2 pr-3">
        <StatusBadge status={ts.status} dot size="sm" />
      </td>
      <td className="py-2 pr-3 text-right">
        <div className="flex items-center justify-end gap-2">
          <Link
            href={`/timesheets/${ts.id}`}
            className="text-xs font-medium text-slate-500 underline-offset-4 hover:text-slate-700 hover:underline"
          >
            View
          </Link>
          <Button
            size="sm"
            variant="secondary"
            disabled={approve.isPending}
            onClick={() => approve.mutate()}
          >
            Approve
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={reject.isPending}
            onClick={() => {
              const comments = window.prompt("Reason for rejection:") ?? "";
              if (comments.trim()) reject.mutate({ comments });
            }}
          >
            Reject
          </Button>
        </div>
      </td>
    </tr>
  );
}
