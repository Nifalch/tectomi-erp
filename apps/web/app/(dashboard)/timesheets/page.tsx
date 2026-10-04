"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { ListPageLayout } from "@/components/layouts/list-page-layout";
import { DataTable } from "@/components/ui/data-table";
import { Tabs } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { ErrorState, LoadingState } from "@/components/ui/state";
import {
  useMyTimesheets, useTimesheets,
} from "@/lib/api/hooks";
import {
  useCreateTimesheet, useSubmitTimesheet, useApproveTimesheet, useRejectTimesheet,
} from "@/lib/api/mutations";
import { useAuthStore } from "@/lib/store/auth-store";
import { toArray } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";

interface Timesheet {
  id: string;
  weekStart: string;
  totalHours?: number;
  status: string;
  user?: { firstName?: string; lastName?: string };
}

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function TimesheetsPage() {
  const role = useAuthStore((s) => s.user?.roles[0] ?? "EMPLOYEE");
  const canApprove = ["SUPER_ADMIN", "ADMIN", "HR_MANAGER", "PROJECT_MANAGER"].includes(role);
  const isHr = ["SUPER_ADMIN", "ADMIN", "HR_MANAGER"].includes(role);

  const [tab, setTab] = useState("my");
  const [createOpen, setCreateOpen] = useState(false);
  const [weekStart, setWeekStart] = useState<Date | undefined>(startOfWeek(new Date()));

  const myQuery = useMyTimesheets();
  const toApproveQuery = useTimesheets(canApprove ? { status: "SUBMITTED" } : undefined);
  const allQuery = useTimesheets();
  const createMutation = useCreateTimesheet();

  const my = toArray<Timesheet>(myQuery.data);
  const toApprove = toArray<Timesheet>(toApproveQuery.data);
  const all = toArray<Timesheet>(allQuery.data);

  const tabs = [
    { key: "my", label: "My Timesheets", count: my.length },
    ...(canApprove ? [{ key: "approve", label: "To Approve", count: toApprove.length }] : []),
    ...(isHr ? [{ key: "all", label: "All", count: all.length }] : []),
  ];

  if (myQuery.isLoading) return <LoadingState label="Loading timesheets..." />;
  if (myQuery.isError) return <ErrorState label="Unable to load timesheets." />;

  const myColumns: ColumnDef<Timesheet, unknown>[] = [
    {
      accessorKey: "weekStart", header: "Week of",
      cell: ({ row }) => new Date(row.original.weekStart).toLocaleDateString(),
    },
    { accessorKey: "totalHours", header: "Total Hours", cell: ({ row }) => row.original.totalHours != null ? `${Number(row.original.totalHours).toFixed(1)}h` : "—" },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} dot size="sm" /> },
    {
      id: "actions", header: "",
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Link href={`/timesheets/${row.original.id}`} className="text-xs font-medium text-primary">View</Link>
          {row.original.status === "DRAFT" && <SubmitBtn id={row.original.id} />}
        </div>
      ),
    },
  ];

  const approveColumns: ColumnDef<Timesheet, unknown>[] = [
    {
      accessorKey: "user", header: "Employee",
      cell: ({ row }) => row.original.user ? `${row.original.user.firstName ?? ""} ${row.original.user.lastName ?? ""}`.trim() : "—",
    },
    { accessorKey: "weekStart", header: "Week of", cell: ({ row }) => new Date(row.original.weekStart).toLocaleDateString() },
    { accessorKey: "totalHours", header: "Hours", cell: ({ row }) => row.original.totalHours != null ? `${Number(row.original.totalHours).toFixed(1)}h` : "—" },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} dot size="sm" /> },
    {
      id: "actions", header: "",
      cell: ({ row }) => <ApproveRejectButtons id={row.original.id} />,
    },
  ];

  return (
    <ListPageLayout
      module="time"
      title="Timesheets"
      description="Weekly timesheets with approval workflow."
      primaryAction={tab === "my" ? { label: "Create Timesheet", icon: <Plus className="mr-1 size-4" />, onClick: () => setCreateOpen(true) } : undefined}
    >
      <Tabs tabs={tabs} activeTab={tab} onTabChange={setTab} />

      {tab === "my" && (
        <DataTable columns={myColumns} data={my} moduleColor="time" emptyState={{ title: "No timesheets yet" }} />
      )}

      {tab === "approve" && canApprove && (
        <DataTable columns={approveColumns} data={toApprove} moduleColor="time" emptyState={{ title: "Nothing to approve" }} />
      )}

      {tab === "all" && isHr && (
        <DataTable columns={approveColumns} data={all} moduleColor="time" />
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Create Timesheet</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <FormField label="Week Start">
              <DatePicker value={weekStart} onChange={setWeekStart} />
            </FormField>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button
                disabled={!weekStart || createMutation.isPending}
                onClick={() => {
                  if (!weekStart) return;
                  createMutation.mutate({ weekStart: weekStart.toISOString() }, {
                    onSuccess: () => setCreateOpen(false),
                  });
                }}
              >
                {createMutation.isPending ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </ListPageLayout>
  );
}

function SubmitBtn({ id }: { id: string }) {
  const submit = useSubmitTimesheet(id);
  return (
    <button onClick={() => submit.mutate()} className="text-xs font-medium text-primary" disabled={submit.isPending}>
      {submit.isPending ? "..." : "Submit"}
    </button>
  );
}

function ApproveRejectButtons({ id }: { id: string }) {
  const approve = useApproveTimesheet(id);
  const reject = useRejectTimesheet(id);
  return (
    <div className="flex gap-2">
      <Link href={`/timesheets/${id}`} className="text-xs font-medium text-slate-500">View</Link>
      <button onClick={() => approve.mutate()} className="text-xs font-medium text-emerald-600" disabled={approve.isPending}>Approve</button>
      <button
        onClick={() => {
          const comments = window.prompt("Rejection reason:") ?? "";
          if (comments.trim()) reject.mutate({ comments });
        }}
        className="text-xs font-medium text-red-600"
        disabled={reject.isPending}
      >Reject</button>
    </div>
  );
}
