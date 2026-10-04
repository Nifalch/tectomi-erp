"use client";
import type { Table as ReactTable } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./button";

interface DataTablePaginationProps<TData> {
  table: ReactTable<TData>;
}

export function DataTablePagination<TData>({ table }: DataTablePaginationProps<TData>) {
  const { pageIndex, pageSize } = table.getState().pagination;
  const total = table.getFilteredRowModel().rows.length;
  const from = pageIndex * pageSize + 1;
  const to = Math.min((pageIndex + 1) * pageSize, total);
  const pageCount = table.getPageCount();

  if (total === 0) return null;

  return (
    <div className="flex flex-col items-center gap-2 text-sm text-slate-500 sm:flex-row sm:justify-between">
      <span className="text-xs sm:text-sm">
        Showing {from}-{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          <ChevronLeft className="size-4" />
        </Button>
        {Array.from({ length: Math.min(pageCount, 5) }, (_, i) => {
          let page: number;
          if (pageCount <= 5) {
            page = i;
          } else if (pageIndex < 3) {
            page = i;
          } else if (pageIndex > pageCount - 4) {
            page = pageCount - 5 + i;
          } else {
            page = pageIndex - 2 + i;
          }
          return (
            <Button
              key={page}
              variant={page === pageIndex ? "default" : "ghost"}
              size="sm"
              onClick={() => table.setPageIndex(page)}
              className="min-w-[36px]"
            >
              {page + 1}
            </Button>
          );
        })}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
