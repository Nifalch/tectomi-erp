"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useMemo } from "react";
import { format, startOfMonth, startOfQuarter, startOfYear, endOfMonth, endOfQuarter, endOfYear, subYears } from "date-fns";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";

const PRESETS: Array<{ value: string; label: string }> = [
  { value: "this-month", label: "This Month" },
  { value: "this-quarter", label: "This Quarter" },
  { value: "this-year", label: "This Year" },
  { value: "last-year", label: "Last Year" },
  { value: "custom", label: "Custom" },
];

export function computeRange(preset: string): { from: string; to: string } | null {
  const now = new Date();
  switch (preset) {
    case "this-month":
      return { from: format(startOfMonth(now), "yyyy-MM-dd"), to: format(endOfMonth(now), "yyyy-MM-dd") };
    case "this-quarter":
      return { from: format(startOfQuarter(now), "yyyy-MM-dd"), to: format(endOfQuarter(now), "yyyy-MM-dd") };
    case "this-year":
      return { from: format(startOfYear(now), "yyyy-MM-dd"), to: format(endOfYear(now), "yyyy-MM-dd") };
    case "last-year": {
      const last = subYears(now, 1);
      return { from: format(startOfYear(last), "yyyy-MM-dd"), to: format(endOfYear(last), "yyyy-MM-dd") };
    }
    default:
      return null;
  }
}

export function useReportRange() {
  const params = useSearchParams();
  const from = params.get("from") ?? undefined;
  const to = params.get("to") ?? undefined;
  return { from, to };
}

export function DateRangeBar() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const preset = params.get("preset") ?? "this-month";

  const updateParams = useCallback(
    (next: Record<string, string | undefined>) => {
      const sp = new URLSearchParams(params.toString());
      Object.entries(next).forEach(([k, v]) => {
        if (v) sp.set(k, v);
        else sp.delete(k);
      });
      router.replace(`${pathname}?${sp.toString()}`);
    },
    [params, pathname, router],
  );

  const onPreset = (val: string) => {
    if (val === "custom") {
      updateParams({ preset: "custom" });
      return;
    }
    const range = computeRange(val);
    if (range) updateParams({ preset: val, from: range.from, to: range.to });
  };

  const fromDate = useMemo(() => (from ? new Date(from) : null), [from]);
  const toDate = useMemo(() => (to ? new Date(to) : null), [to]);

  return (
    <div className="rounded-2xl border border-border bg-white/60 p-4 dark:bg-slate-900/60 print:hidden">
      {/* Responsive grid: one column on small screens, 3 equal columns
          from `sm` up. The previous flex+min-width layout pushed each
          control to overflow on narrow viewports and bunched them at
          the same odd widths on wide ones. */}
      <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Range</label>
          <Select value={preset} onValueChange={onPreset} options={PRESETS} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500">From</label>
          <DatePicker
            value={fromDate}
            onChange={(d) => updateParams({ preset: "custom", from: d ? format(d, "yyyy-MM-dd") : undefined })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500">To</label>
          <DatePicker
            value={toDate}
            onChange={(d) => updateParams({ preset: "custom", to: d ? format(d, "yyyy-MM-dd") : undefined })}
          />
        </div>
      </div>
    </div>
  );
}
