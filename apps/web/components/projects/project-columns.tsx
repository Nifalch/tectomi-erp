"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { createActionsColumn, type RowAction } from "@/components/ui/data-table-row-actions";
import { Copy, Eye, Pencil, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export interface ProjectRow {
  id: string;
  name: string;
  status: string;
  client?: { companyName: string };
  manager: { firstName: string; lastName: string };
  milestones: Array<unknown>;
  budget?: number;
  startDate?: string;
  endDate?: string;
  clientId?: string;
  description?: string;
  managerId?: string;
}

export function getProjectColumns(actions: {
  onView: (row: ProjectRow) => void;
  onEdit: (row: ProjectRow) => void;
  onDelete: (row: ProjectRow) => void;
  onClone?: (row: ProjectRow) => void;
  canSeeFinance?: boolean;
  /** Only super admins can delete. */
  canDelete?: boolean;
}): ColumnDef<ProjectRow, unknown>[] {
  const rowActions: RowAction<ProjectRow>[] = [
    { label: "View", icon: <Eye className="size-4" />, onClick: actions.onView },
    { label: "Edit", icon: <Pencil className="size-4" />, onClick: actions.onEdit },
    ...(actions.onClone
      ? [{
          label: "Clone",
          icon: <Copy className="size-4" />,
          onClick: actions.onClone,
        } satisfies RowAction<ProjectRow>]
      : []),
    ...(actions.canDelete
      ? [{
          label: "Delete",
          icon: <Trash2 className="size-4" />,
          onClick: actions.onDelete,
          destructive: true,
          separator: true,
        } satisfies RowAction<ProjectRow>]
      : []),
  ];

  const columns: ColumnDef<ProjectRow, unknown>[] = [
    {
      accessorKey: "name",
      header: "Project",
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.name}</div>
          {actions.canSeeFinance && row.original.client?.companyName && (
            <div className="text-xs text-slate-500">{row.original.client.companyName}</div>
          )}
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
      filterFn: "equals",
    },
    {
      id: "manager",
      header: "Manager",
      cell: ({ row }) => `${row.original.manager.firstName} ${row.original.manager.lastName}`,
    },
    {
      id: "milestones",
      header: "Milestones",
      cell: ({ row }) => row.original.milestones.length,
    },
  ];

  if (actions.canSeeFinance) {
    columns.splice(2, 0, {
      id: "client",
      header: "Client",
      cell: ({ row }) => row.original.client?.companyName ?? "—",
    });
    columns.push({
      id: "budget",
      header: "Budget",
      cell: ({ row }) => (row.original.budget != null ? formatCurrency(Number(row.original.budget)) : "—"),
    });
  }

  columns.push(createActionsColumn(rowActions));
  return columns;
}
