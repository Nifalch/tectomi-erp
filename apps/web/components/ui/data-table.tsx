"use client";
import * as React from "react";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Table, THead, TBody, TH, TD } from "./table";
import { DataTableToolbar } from "./data-table-toolbar";
import { DataTablePagination } from "./data-table-pagination";
import { SkeletonTable } from "./skeleton-table";
import type { ModuleKey } from "@nuro7/contracts";

interface FilterOption {
  column: string;
  label: string;
  options: Array<{ value: string; label: string }>;
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchPlaceholder?: string;
  searchColumn?: string;
  filterOptions?: FilterOption[];
  onRowClick?: (row: TData) => void;
  loading?: boolean;
  emptyState?: {
    icon?: React.ReactNode;
    title: string;
    description?: string;
    action?: React.ReactNode;
  };
  columnVisibility?: boolean;
  moduleColor?: ModuleKey;
  pageSize?: number;
  /** Hide the built-in search/filter toolbar when the page has its own. */
  hideToolbar?: boolean;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchPlaceholder,
  searchColumn,
  filterOptions,
  onRowClick,
  loading,
  emptyState,
  columnVisibility: showColumnVisibility,
  pageSize = 10,
  hideToolbar,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = React.useState("");

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, columnVisibility, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  if (loading) {
    return <SkeletonTable columns={columns.length} rows={pageSize} />;
  }

  return (
    <div className="space-y-4">
      {!hideToolbar && (
        <DataTableToolbar
          searchValue={globalFilter}
          onSearchChange={setGlobalFilter}
          searchPlaceholder={searchPlaceholder}
          filterOptions={filterOptions}
          table={table}
          showColumnVisibility={showColumnVisibility}
        />
      )}

      <div className="overflow-x-auto rounded-2xl border border-border bg-white dark:bg-slate-900/80">
        <Table>
          <THead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TH
                    key={header.id}
                    className={header.column.getCanSort() ? "cursor-pointer select-none" : ""}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-1">
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === "asc" && " \u2191"}
                      {header.column.getIsSorted() === "desc" && " \u2193"}
                    </div>
                  </TH>
                ))}
              </tr>
            ))}
          </THead>
          <TBody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-16 text-center">
                  {emptyState ? (
                    <div className="flex flex-col items-center gap-2">
                      {emptyState.icon}
                      <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{emptyState.title}</p>
                      {emptyState.description && <p className="text-xs text-slate-400">{emptyState.description}</p>}
                      {emptyState.action}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">No results found.</p>
                  )}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={onRowClick ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" : ""}
                  onClick={(e) => {
                    // Don't navigate when the click originated inside the row-actions cell,
                    // a button, a link, or any interactive child. Prevents "clicking Delete
                    // in the dropdown also opens the row" bugs.
                    const target = e.target as HTMLElement;
                    if (
                      target.closest?.("[data-row-actions]") ||
                      target.closest?.("button") ||
                      target.closest?.("a") ||
                      target.closest?.('[role="menu"]') ||
                      target.closest?.('[role="menuitem"]')
                    ) {
                      return;
                    }
                    onRowClick?.(row.original);
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TD
                      key={cell.id}
                      data-row-actions={cell.column.id === "actions" ? "" : undefined}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TD>
                  ))}
                </tr>
              ))
            )}
          </TBody>
        </Table>
      </div>

      <DataTablePagination table={table} />
    </div>
  );
}
