import { cn } from "@/lib/utils";

interface SkeletonTableProps {
  columns: number;
  rows?: number;
}

export function SkeletonTable({ columns, rows = 5 }: SkeletonTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white dark:bg-slate-900/80">
      <div className="border-b border-border bg-slate-50 dark:bg-slate-800/50">
        <div className="flex gap-4 px-4 py-3">
          {Array.from({ length: columns }, (_, i) => (
            <div key={i} className="h-4 flex-1 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
          ))}
        </div>
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className={cn("flex gap-4 px-4 py-4", r < rows - 1 && "border-b border-border/50")}>
          {Array.from({ length: columns }, (_, c) => (
            <div
              key={c}
              className="h-4 flex-1 animate-pulse rounded bg-slate-100 dark:bg-slate-800"
              style={{ animationDelay: `${(r * columns + c) * 50}ms` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
