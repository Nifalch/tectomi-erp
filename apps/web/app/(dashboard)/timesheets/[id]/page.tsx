"use client";

import { useParams } from "next/navigation";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, THead, TBody, TH, TD } from "@/components/ui/table";
import { ModuleHeader } from "@/components/layout/module-header";
import { LoadingState, ErrorState } from "@/components/ui/state";
import { useTimesheet } from "@/lib/api/hooks";
import { useSubmitTimesheet, useApproveTimesheet, useRejectTimesheet } from "@/lib/api/mutations";
import { toArray } from "@/lib/utils";

interface Entry {
  id: string;
  // Backend returns `startTime` from TimeEntry, not `date`.
  startTime: string;
  project?: { name?: string };
  task?: { title?: string };
  // Field is `notes` on TimeEntry, not `description`.
  notes?: string;
  duration?: number;
}

interface TimesheetDetail {
  id: string;
  weekStart?: string;
  weekEnd?: string;
  totalHours?: number;
  status: string;
  user?: { firstName?: string; lastName?: string };
  entries?: Entry[];
}

export default function TimesheetDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const query = useTimesheet(id);
  const submit = useSubmitTimesheet(id);
  const approve = useApproveTimesheet(id);
  const reject = useRejectTimesheet(id);

  if (query.isLoading) return <LoadingState label="Loading timesheet..." />;
  if (query.isError || !query.data) return <ErrorState label="Unable to load timesheet." />;

  const ts = query.data as unknown as TimesheetDetail;
  const entries = toArray<Entry>((ts.entries as unknown as Array<Entry>) ?? []);

  return (
    <div className="flex flex-col gap-6">
      <ModuleHeader
        module="time"
        title="Timesheet"
        description={ts.weekStart ? `Week of ${new Date(ts.weekStart).toLocaleDateString()}` : ""}
      />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base">
              {ts.user ? `${ts.user.firstName ?? ""} ${ts.user.lastName ?? ""}`.trim() : "My Timesheet"}
            </CardTitle>
            <div className="mt-1 text-sm text-slate-500">
              Total: {ts.totalHours != null ? `${Number(ts.totalHours).toFixed(1)}h` : "—"}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={ts.status} dot />
            {ts.status === "DRAFT" && (
              <Button size="sm" onClick={() => submit.mutate()} disabled={submit.isPending}>
                {submit.isPending ? "..." : "Submit"}
              </Button>
            )}
            {ts.status === "SUBMITTED" && (
              <>
                <Button size="sm" onClick={() => approve.mutate()} disabled={approve.isPending}>
                  {approve.isPending ? "..." : "Approve"}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => {
                  const comments = window.prompt("Rejection reason:") ?? "";
                  if (comments.trim()) reject.mutate({ comments });
                }} disabled={reject.isPending}>
                  Reject
                </Button>
              </>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle className="mb-4">Entries</CardTitle>
        <Table>
          <THead>
            <tr><TH>Date</TH><TH>Project</TH><TH>Task</TH><TH>Description</TH><TH>Hours</TH></tr>
          </THead>
          <TBody>
            {entries.length === 0 ? (
              <tr><td colSpan={5} className="py-8 text-center text-slate-400">No entries logged.</td></tr>
            ) : entries.map((e) => (
              <tr key={e.id}>
                <TD>{e.startTime ? new Date(e.startTime).toLocaleDateString() : "—"}</TD>
                <TD>{e.project?.name ?? "—"}</TD>
                <TD>{e.task?.title ?? "—"}</TD>
                <TD>{e.notes ?? "—"}</TD>
                <TD>{e.duration != null ? `${(Number(e.duration) / 60).toFixed(1)}h` : "—"}</TD>
              </tr>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
