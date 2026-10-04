"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useProjectTasks } from "@/lib/api/hooks";
import { toArray, cn } from "@/lib/utils";
import { TaskDetailDrawer } from "@/components/tasks/task-detail-drawer";
import { CreateTaskDialog } from "@/components/tasks/create-task-dialog";

interface Task {
  id: string;
  title: string;
  priority: string;
  dueDate?: string | null;
  status: string;
}

const PRIORITY_BG: Record<string, string> = {
  URGENT: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
  HIGH: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  MEDIUM: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  LOW: "bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/20",
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function startOfMonthGrid(year: number, month: number) {
  // Monday-first calendar: compute the first Monday on/before the 1st.
  const first = new Date(year, month, 1);
  const dayOfWeek = (first.getDay() + 6) % 7; // Mon=0
  first.setDate(1 - dayOfWeek);
  return first;
}

export function ProjectCalendarTab({ projectId }: { projectId: string }) {
  const query = useProjectTasks(projectId);
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDueDate, setCreateDueDate] = useState<string | undefined>();

  const tasks = useMemo(
    () => (query.data ? toArray<Task>(query.data).filter((t) => !!t.dueDate) : []),
    [query.data],
  );

  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.dueDate) continue;
      const d = new Date(t.dueDate);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const list = map.get(key) ?? [];
      list.push(t);
      map.set(key, list);
    }
    return map;
  }, [tasks]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const gridStart = startOfMonthGrid(year, month);
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

  // Generate 6 weeks * 7 days = 42 cells
  const days: Array<{ date: Date; inMonth: boolean; key: string }> = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    days.push({
      date: d,
      inMonth: d.getMonth() === month,
      key: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`,
    });
  }

  if (query.isLoading) return <LoadingState label="Loading calendar..." />;
  if (query.isError) return <ErrorState label="Unable to load tasks." />;

  const monthName = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const handleAddTaskForDate = (date: Date) => {
    setCreateDueDate(date.toISOString());
    setCreateOpen(true);
  };

  const goPrev = () => setCursor(new Date(year, month - 1, 1));
  const goNext = () => setCursor(new Date(year, month + 1, 1));
  const goToday = () => {
    const now = new Date();
    setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={goPrev} aria-label="Previous month">
            <ChevronLeft className="size-4" />
          </Button>
          <Button size="sm" variant="secondary" onClick={goToday}>Today</Button>
          <Button size="sm" variant="secondary" onClick={goNext} aria-label="Next month">
            <ChevronRight className="size-4" />
          </Button>
          <h3 className="ml-2 text-base font-semibold text-slate-800 dark:text-slate-100">
            {monthName}
          </h3>
        </div>
        <div className="text-xs text-slate-500">{tasks.length} scheduled tasks</div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/60 bg-white dark:bg-slate-900/50">
        <div className="grid grid-cols-7 border-b border-border/60 bg-slate-50 dark:bg-slate-900/70">
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className="px-2 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500"
            >
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 auto-rows-fr">
          {days.map((d) => {
            const dayTasks = tasksByDay.get(d.key) ?? [];
            const isToday = d.key === todayKey;
            return (
              <div
                key={d.key}
                className={cn(
                  "group relative min-h-[100px] border-b border-r border-border/40 p-1.5 text-xs",
                  !d.inMonth && "bg-slate-50/40 text-slate-400 dark:bg-slate-900/30",
                )}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className={cn(
                      "inline-flex size-5 items-center justify-center rounded-full text-[11px] font-semibold",
                      isToday ? "bg-primary text-white" : "text-slate-600 dark:text-slate-300",
                    )}
                  >
                    {d.date.getDate()}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleAddTaskForDate(d.date)}
                    className="rounded p-0.5 text-slate-300 opacity-0 transition hover:bg-slate-100 hover:text-primary group-hover:opacity-100 dark:hover:bg-slate-800"
                    aria-label="Add task"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
                <div className="flex flex-col gap-1">
                  {dayTasks.slice(0, 3).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedTaskId(t.id)}
                      className={cn(
                        "truncate rounded border px-1.5 py-0.5 text-left text-[10.5px] font-medium transition hover:brightness-95",
                        PRIORITY_BG[t.priority] ?? PRIORITY_BG.MEDIUM,
                      )}
                      title={t.title}
                    >
                      {t.title}
                    </button>
                  ))}
                  {dayTasks.length > 3 && (
                    <span className="px-1 text-[10px] text-slate-500">
                      +{dayTasks.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <TaskDetailDrawer taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />

      <CreateTaskDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setCreateDueDate(undefined);
        }}
        defaultProjectId={projectId}
        defaultDueDate={createDueDate}
      />
    </div>
  );
}

export default ProjectCalendarTab;
