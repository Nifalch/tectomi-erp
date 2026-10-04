import { ArrowUpRight, ArrowDownRight, Minus, TrendingUp } from "lucide-react";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type DeltaTone = "positive" | "negative" | "neutral";

export interface StatCardProps {
  title: string;
  value: string;
  delta?: string;
  deltaTone?: DeltaTone;
  deltaLabel?: string;
  icon?: typeof TrendingUp;
}

export function StatCard({
  title,
  value,
  delta,
  deltaTone = "positive",
  deltaLabel,
  icon: IconComponent,
}: StatCardProps) {
  const toneClass =
    deltaTone === "negative"
      ? "text-rose-600 dark:text-rose-400 bg-rose-500/10"
      : deltaTone === "neutral"
      ? "text-slate-600 dark:text-slate-400 bg-slate-500/10"
      : "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10";

  const DeltaIcon = deltaTone === "negative" ? ArrowDownRight : deltaTone === "neutral" ? Minus : ArrowUpRight;

  return (
    <Card className="card-hover group relative overflow-hidden min-h-[120px] sm:min-h-[148px] flex flex-col justify-between">
      <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-orange-500/40 via-amber-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <div>
        <div className="flex items-center justify-between">
          <CardDescription className="text-xs uppercase font-medium tracking-wider">{title}</CardDescription>
          {IconComponent && (
            <div className="rounded-xl p-2 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 transition-colors group-hover:bg-primary/10 group-hover:text-primary">
              <IconComponent className="size-4" />
            </div>
          )}
        </div>
        <CardTitle className="mt-3 text-2xl font-bold sm:mt-5 sm:text-3xl tracking-tight text-slate-900 dark:text-white font-mono">
          {value}
        </CardTitle>
      </div>

      {(delta || deltaLabel) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {delta && (
            <div className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium", toneClass)}>
              <DeltaIcon className="size-3" />
              <span>{delta}</span>
            </div>
          )}
          {deltaLabel && <span className="text-slate-500 dark:text-slate-400">{deltaLabel}</span>}
        </div>
      )}
    </Card>
  );
}
