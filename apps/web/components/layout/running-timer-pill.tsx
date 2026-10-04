"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Square } from "lucide-react";
import { useActiveTimer } from "@/lib/api/hooks";
import { useStopTimer } from "@/lib/api/mutations";
import { cn } from "@/lib/utils";

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

export function RunningTimerPill() {
  const router = useRouter();
  const activeQuery = useActiveTimer();
  const stopMutation = useStopTimer();
  const active = (activeQuery.data ?? null) as
    | { id?: string; taskId?: string | null; startTime?: string; task?: { id?: string; title?: string } | null }
    | null;

  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (!active?.id) return;
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active?.id]);

  if (!active || !active.id) return null;

  const elapsedSeconds = active.startTime
    ? Math.floor((nowTick - new Date(active.startTime).getTime()) / 1000)
    : 0;
  const title = active.task?.title ?? "Untitled task";
  const taskId = active.task?.id ?? active.taskId ?? null;

  const handleOpenTask = () => {
    if (taskId) {
      router.push(`/tasks?openTask=${taskId}`);
    } else {
      router.push("/tasks");
    }
  };

  const handleStop = (e: React.MouseEvent) => {
    e.stopPropagation();
    stopMutation.mutate(undefined);
  };

  return (
    <div
      className={cn(
        // Sit ABOVE the chat-widget bubble (which lives at bottom-5 right-5,
        // size-12 = 48px). Shifting to bottom-[80px] clears the chat button
        // and its hover ring without crowding the corner.
        "fixed bottom-[74px] sm:bottom-[80px] right-3 sm:right-5 z-40 flex max-w-[calc(100vw-24px)] items-center gap-2 sm:gap-2.5 rounded-full border border-red-200 bg-red-50/95 px-3 sm:px-4 py-1.5 sm:py-2 shadow-lg backdrop-blur",
        "dark:border-red-900 dark:bg-red-950/80",
      )}
    >
      <span className="relative flex size-2.5 items-center justify-center" aria-hidden>
        <span className="absolute inline-flex size-2.5 animate-ping rounded-full bg-red-500 opacity-75" />
        <span className="relative inline-flex size-2.5 rounded-full bg-red-500" />
      </span>
      <button
        type="button"
        onClick={handleOpenTask}
        className="max-w-[200px] truncate text-left text-sm font-medium text-red-800 hover:underline dark:text-red-200"
        title={title}
      >
        {title}
      </button>
      <span className="tabular-nums text-sm font-semibold text-red-700 dark:text-red-300">
        {formatElapsed(elapsedSeconds)}
      </span>
      <button
        type="button"
        onClick={handleStop}
        disabled={stopMutation.isPending}
        className="inline-flex size-7 items-center justify-center rounded-full bg-red-600 text-white transition hover:bg-red-700 disabled:opacity-60"
        aria-label="Stop timer"
        title="Stop timer"
      >
        <Square className="size-3.5 fill-current" />
      </button>
    </div>
  );
}
