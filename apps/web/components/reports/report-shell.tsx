"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateRangeBar } from "./date-range-bar";

interface ReportShellProps {
  title: string;
  description?: string;
  children: ReactNode;
  showRange?: boolean;
  showPrint?: boolean;
  extraActions?: ReactNode;
}

export function ReportShell({ title, description, children, showRange = true, showPrint = true, extraActions }: ReportShellProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <Link
            href="/reports"
            className="inline-flex size-9 items-center justify-center rounded-full border border-border bg-white hover:bg-muted/60 dark:bg-slate-900"
          >
            <ChevronLeft className="size-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {description && <p className="text-sm text-slate-500">{description}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {extraActions}
          {showPrint && (
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              <Printer className="mr-2 size-4" />
              Print / Export
            </Button>
          )}
        </div>
      </div>
      {showRange && <DateRangeBar />}
      <div className="print:m-0">{children}</div>
    </div>
  );
}
