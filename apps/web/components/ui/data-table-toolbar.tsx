"use client";
import type { Table as ReactTable } from "@tanstack/react-table";
import { Search, SlidersHorizontal } from "lucide-react";
import { Input } from "./input";
import { Select } from "./select";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "./dropdown-menu";
import { Button } from "./button";
import { cn } from "@/lib/utils";

interface FilterOption {
  column: string;
  label: string;
  options: Array<{ value: string; label: string }>;
}

interface DataTableToolbarProps<TData> {
  table: ReactTable<TData>;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filterOptions?: FilterOption[];
  showColumnVisibility?: boolean;
}

export function DataTableToolbar<TData>({
  table,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search...",
  filterOptions,
  showColumnVisibility,
}: DataTableToolbarProps<TData>) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="relative flex-1 sm:max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="pl-9"
        />
      </div>

      <div className="flex items-center gap-2">
        {filterOptions?.map((filter) => (
          <Select
            key={filter.column}
            placeholder={filter.label}
            options={[{ value: "__all__", label: `All ${filter.label}` }, ...filter.options]}
            value={(table.getColumn(filter.column)?.getFilterValue() as string) ?? "__all__"}
            onValueChange={(val) => {
              table.getColumn(filter.column)?.setFilterValue(val === "__all__" ? undefined : val);
            }}
          />
        ))}

        {showColumnVisibility && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm">
                <SlidersHorizontal className="mr-2 size-4" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {table.getAllColumns().filter((col) => col.getCanHide()).map((col) => (
                <DropdownMenuItem
                  key={col.id}
                  onClick={() => col.toggleVisibility(!col.getIsVisible())}
                >
                  <span className={cn("mr-2 size-3.5 rounded border", col.getIsVisible() ? "border-primary bg-primary" : "border-slate-300")} />
                  {typeof col.columnDef.header === "string" ? col.columnDef.header : col.id}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
