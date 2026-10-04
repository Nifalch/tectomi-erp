"use client";
import { MoreHorizontal } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "./dropdown-menu";
import { Button } from "./button";
import type { ReactNode } from "react";

export interface RowAction<TData> {
  label: string;
  icon?: ReactNode;
  onClick: (row: TData) => void;
  destructive?: boolean;
  separator?: boolean;
  /** Return true to hide this action for the given row (e.g. permission check). */
  hidden?: (row: TData) => boolean;
}

export function createActionsColumn<TData>(actions: RowAction<TData>[]): ColumnDef<TData, unknown> {
  return {
    id: "actions",
    header: "",
    cell: ({ row }) => {
      const visible = actions.filter((a) => !a.hidden?.(row.original));
      if (visible.length === 0) return null;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="size-8 p-0">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {visible.map((action, i) => (
              <div key={action.label}>
                {action.separator && i > 0 && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  onClick={() => action.onClick(row.original)}
                  destructive={action.destructive}
                >
                  {action.icon && <span className="size-4">{action.icon}</span>}
                  {action.label}
                </DropdownMenuItem>
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
    enableSorting: false,
    enableHiding: false,
  };
}
