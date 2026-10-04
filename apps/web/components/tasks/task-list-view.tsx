"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

export interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  projectId?: string;
  project?: { name?: string } | null;
  assignedTo?: { firstName?: string; lastName?: string } | null;
  dueDate?: string | null;
  storyPoints?: number | null;
  sprintId?: string | null;
  sprint?: { id?: string; name?: string } | null;
  progressPercent?: number | null;
  customStatusId?: string | null;
  customStatus?: {
    id: string;
    name: string;
    color: string;
    category?: string;
  } | null;
}

const PRIORITY_META: Record<string, { label: string; className: string }> = {
  URGENT: { label: "Urgent", className: "bg-red-500/10 text-red-700 dark:text-red-300" },
  HIGH: { label: "High", className: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  MEDIUM: { label: "Medium", className: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  LOW: { label: "Low", className: "bg-slate-500/10 text-slate-600 dark:text-slate-300" },
};

function PriorityPill({ value }: { value: string }) {
  const meta = PRIORITY_META[value] ?? { label: value, className: "bg-slate-500/10 text-slate-600" };
  return (
    <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium", meta.className)}>
      {meta.label}
    </span>
  );
}

export function TaskListView({
  tasks,
  onRowClick,
  showProject = true,
}: {
  tasks: TaskRow[];
  onRowClick: (task: TaskRow) => void;
  showProject?: boolean;
}) {
  const columns = useMemo<ColumnDef<TaskRow>[]>(() => {
    const base: ColumnDef<TaskRow>[] = [
      {
        accessorKey: "title",
        header: "Title",
        cell: ({ row }) => (
          <span className="max-w-[360px] truncate font-medium text-slate-900 dark:text-white">
            {row.original.title}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const cs = row.original.customStatus;
          if (cs) {
            return (
              <span
                className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium"
                style={{
                  backgroundColor: `${cs.color}1f`,
                  color: cs.color,
                }}
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: cs.color }}
                />
                {cs.name}
              </span>
            );
          }
          return <StatusBadge status={row.original.status} size="sm" />;
        },
      },
      {
        accessorKey: "priority",
        header: "Priority",
        cell: ({ row }) => <PriorityPill value={row.original.priority} />,
      },
      {
        id: "assignee",
        header: "Assignee",
        accessorFn: (r) =>
          r.assignedTo ? `${r.assignedTo.firstName ?? ""} ${r.assignedTo.lastName ?? ""}`.trim() : "",
        cell: ({ row }) => {
          const a = row.original.assignedTo;
          const name = a ? `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim() : "";
          return name ? (
            <span className="text-slate-700 dark:text-slate-200">{name}</span>
          ) : (
            <span className="italic text-slate-400">Unassigned</span>
          );
        },
      },
    ];

    if (showProject) {
      base.push({
        id: "project",
        header: "Project",
        accessorFn: (r) => r.project?.name ?? "",
        cell: ({ row }) => (
          <span className="text-slate-600 dark:text-slate-300">
            {row.original.project?.name ?? "—"}
          </span>
        ),
      });
    }

    base.push(
      {
        id: "sprint",
        header: "Sprint",
        accessorFn: (r) => r.sprint?.name ?? "",
        cell: ({ row }) => (
          <span className="text-slate-600 dark:text-slate-300">
            {row.original.sprint?.name ?? <span className="italic text-slate-400">Backlog</span>}
          </span>
        ),
      },
      {
        id: "due",
        header: "Due",
        accessorFn: (r) => (r.dueDate ? new Date(r.dueDate).getTime() : 0),
        cell: ({ row }) => {
          if (!row.original.dueDate) return <span className="italic text-slate-400">—</span>;
          const d = new Date(row.original.dueDate);
          const overdue = d.getTime() < Date.now() && row.original.status !== "DONE";
          return (
            <span className={cn("tabular-nums", overdue && "text-red-600 dark:text-red-400")}>
              {d.toLocaleDateString()}
            </span>
          );
        },
      },
      {
        id: "progress",
        header: "Progress",
        accessorFn: (r) => r.progressPercent ?? 0,
        cell: ({ row }) => {
          const v = row.original.progressPercent ?? 0;
          return (
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.min(100, Math.max(0, v))}%` }}
                />
              </div>
              <span className="w-8 text-right text-[11px] tabular-nums text-slate-500">{v}%</span>
            </div>
          );
        },
      },
      {
        id: "points",
        header: "Story pts",
        accessorFn: (r) => r.storyPoints ?? 0,
        cell: ({ row }) => (
          <span className="tabular-nums text-slate-600 dark:text-slate-300">
            {typeof row.original.storyPoints === "number" ? row.original.storyPoints : "—"}
          </span>
        ),
      },
    );

    return base;
  }, [showProject]);

  return (
    <DataTable
      columns={columns}
      data={tasks}
      onRowClick={onRowClick}
      hideToolbar
      pageSize={25}
      emptyState={{ title: "No tasks match these filters" }}
    />
  );
}
