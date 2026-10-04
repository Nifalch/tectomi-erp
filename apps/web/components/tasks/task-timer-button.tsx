"use client";

import { useEffect, useState } from "react";
import { Play, Square, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useActiveTimer } from "@/lib/api/hooks";
import { useStartTimer, useStopTimer } from "@/lib/api/mutations";

interface Props {
  taskId: string;
  size?: "sm" | "md";
  showLabel?: boolean;
}

function formatElapsed(seconds: number): string {
  if (seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

export function TaskTimerButton({ taskId, size = "md", showLabel = false }: Props) {
  const activeQuery = useActiveTimer();
  const startMutation = useStartTimer();
  const stopMutation = useStopTimer();

  const active = (activeQuery.data ?? null) as { id?: string; taskId?: string | null; startTime?: string } | null;
  const isRunningHere = !!active && active.taskId === taskId;
  const isRunningElsewhere = !!active && active.id && !isRunningHere;

  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (!isRunningHere) return;
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isRunningHere]);

  const elapsedSeconds = isRunningHere && active?.startTime
    ? Math.floor((nowTick - new Date(active.startTime).getTime()) / 1000)
    : 0;

  const pending = startMutation.isPending || stopMutation.isPending;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pending) return;
    if (isRunningHere) {
      stopMutation.mutate(undefined);
    } else {
      startMutation.mutate({ taskId });
    }
  };

  const tooltip = isRunningElsewhere
    ? "Another task is being tracked — starting here will stop it."
    : isRunningHere
      ? "Stop timer"
      : "Start timer";

  const sizeClasses = size === "sm"
    ? "h-6 px-1.5 text-[11px] gap-1"
    : "h-8 px-2.5 text-xs gap-1.5";
  const iconSize = size === "sm" ? "size-3" : "size-3.5";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      title={tooltip}
      aria-label={tooltip}
      className={cn(
        "inline-flex items-center rounded-md border font-medium transition-shadow hover:shadow-sm disabled:opacity-60",
        sizeClasses,
        isRunningHere
          ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800",
      )}
    >
      {isRunningHere ? (
        <>
          <span className="relative flex size-2 items-center justify-center" aria-hidden>
            <span className="absolute inline-flex size-2 animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-red-500" />
          </span>
          <span className="tabular-nums">{formatElapsed(elapsedSeconds)}</span>
          {(showLabel || size !== "sm") && size !== "sm" && (
            <>
              <Square className={cn(iconSize, "ml-0.5 fill-current")} />
              {showLabel && <span>Stop</span>}
            </>
          )}
          {size === "sm" && <Square className={cn(iconSize, "fill-current")} />}
        </>
      ) : (
        <>
          {size === "sm" ? <Clock className={iconSize} /> : <Play className={cn(iconSize, "fill-current")} />}
          {showLabel ? <span>Start</span> : size !== "sm" ? <span>Start</span> : null}
        </>
      )}
    </button>
  );
}
