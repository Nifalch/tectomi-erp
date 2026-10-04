import type { ReactNode } from "react";
import { Loader2, AlertCircle, Inbox, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LoadingState({ label = "Loading data..." }: { label?: string }) {
  return (
    <Card className="flex flex-col items-center justify-center py-12 text-center">
      <div className="relative flex items-center justify-center">
        <div className="absolute size-10 rounded-full bg-orange-500/15 animate-ping" />
        <Loader2 className="size-6 text-primary animate-spin" />
      </div>
      <p className="mt-4 text-sm font-medium text-slate-600 dark:text-slate-400">{label}</p>
    </Card>
  );
}

export function ErrorState({
  label = "Something went wrong while loading this module.",
  onRetry,
}: {
  label?: string;
  onRetry?: () => void;
}) {
  return (
    <Card className="flex flex-col items-center justify-center py-12 text-center border-red-500/20 bg-red-500/5">
      <div className="flex size-10 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400">
        <AlertCircle className="size-5" />
      </div>
      <p className="mt-3 text-sm font-medium text-red-600 dark:text-red-400">{label}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-4 text-xs">
          Try Again
        </Button>
      )}
    </Card>
  );
}

export function EmptyState({
  title = "No data yet",
  description = "Get started by creating your first entry.",
  actionLabel,
  onAction,
  icon: Icon = Inbox,
  className,
  children,
}: {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: typeof Inbox;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-slate-50/50 p-8 text-center dark:bg-slate-900/30 sm:p-12",
        className,
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-900/5 dark:bg-slate-800 dark:ring-white/10">
        <Icon className="size-6 text-slate-400 dark:text-slate-500" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-slate-800 dark:text-slate-200">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-slate-500 dark:text-slate-400">{description}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction} size="sm" className="mt-5 gap-1.5 shadow-sm">
          <Plus className="size-4" />
          {actionLabel}
        </Button>
      )}
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}
