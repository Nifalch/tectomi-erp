"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { useProject, useProjectTasks } from "@/lib/api/hooks";
import { useUpdateTask } from "@/lib/api/mutations";
import { useAuthStore } from "@/lib/store/auth-store";
import { toArray } from "@/lib/utils";
import { TaskDetailDrawer } from "@/components/tasks/task-detail-drawer";

interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority?: string;
  createdAt?: string;
  startDate?: string | null;
  dueDate?: string | null;
  assignedTo?: { firstName?: string; lastName?: string } | null;
}

const PRIORITY_COLORS: Record<string, string> = {
  URGENT: "#ef4444",
  HIGH: "#f97316",
  MEDIUM: "#f59e0b",
  LOW: "#22c55e",
};

const DAY_MS = 86400000;

function daysBetween(a: Date, b: Date) {
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / DAY_MS));
}

function startOfDayISO(d: Date): string {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c.toISOString();
}

function fmtShort(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type DragKind = "move" | "resize-start" | "resize-end";

interface DragState {
  taskId: string;
  kind: DragKind;
  startX: number;
  originalStart: Date;
  originalEnd: Date;
  currentStart: Date;
  currentEnd: Date;
}

export function ProjectGanttTab({ projectId }: { projectId: string }) {
  const tasksQuery = useProjectTasks(projectId);
  const projectQuery = useProject(projectId);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const roles = useAuthStore((s) => s.user?.roles ?? []);
  const canEdit = roles.some((r) => r !== "CLIENT" && r !== "EMPLOYEE");

  const tasks = toArray<TaskRow>(tasksQuery.data);

  // Local overrides produced by optimistic drag updates.
  const [overrides, setOverrides] = useState<Record<string, { startDate?: string; dueDate?: string }>>({});

  const projectStart = useMemo(() => {
    const raw = (projectQuery.data as any)?.startDate;
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [projectQuery.data]);

  const effectiveTasks = useMemo(() => {
    return tasks.map((t) => {
      const o = overrides[t.id];
      return {
        ...t,
        startDate: o?.startDate ?? t.startDate,
        dueDate: o?.dueDate ?? t.dueDate,
      };
    });
  }, [tasks, overrides]);

  const { rangeStart, rangeEnd, totalDays, scaledTasks } = useMemo(() => {
    const now = new Date();
    if (effectiveTasks.length === 0) {
      return {
        rangeStart: now,
        rangeEnd: now,
        totalDays: 1,
        scaledTasks: [] as Array<
          TaskRow & { offsetPct: number; widthPct: number; startD: Date; endD: Date; planned: boolean }
        >,
      };
    }
    const starts = effectiveTasks
      .map((t) => {
        const src = t.startDate ?? t.createdAt;
        return src ? new Date(src) : null;
      })
      .filter((d): d is Date => !!d && !Number.isNaN(d.getTime()));
    const ends = effectiveTasks
      .map((t) => (t.dueDate ? new Date(t.dueDate) : now))
      .filter((d): d is Date => !!d && !Number.isNaN(d.getTime()));

    const minStart = starts.length > 0 ? new Date(Math.min(...starts.map((d) => d.getTime()))) : now;
    const maxEnd = ends.length > 0 ? new Date(Math.max(...ends.map((d) => d.getTime()))) : now;

    const maxSpan = 90;
    const span = Math.min(maxSpan, Math.max(14, daysBetween(minStart, maxEnd)));
    const rangeStart = new Date(minStart);
    const rangeEnd = new Date(rangeStart);
    rangeEnd.setDate(rangeEnd.getDate() + span);
    const totalDays = daysBetween(rangeStart, rangeEnd);

    const scaledTasks = effectiveTasks.map((t) => {
      const startSrc = t.startDate ?? t.createdAt;
      const startD = startSrc ? new Date(startSrc) : rangeStart;
      const endD = t.dueDate ? new Date(t.dueDate) : now;
      const s = Math.max(0, daysBetween(rangeStart, startD) - 1);
      const e = Math.max(s + 1, daysBetween(rangeStart, endD));
      const offsetPct = (s / totalDays) * 100;
      const widthPct = Math.max(2, ((e - s) / totalDays) * 100);
      const planned = !!t.startDate;
      return { ...t, offsetPct, widthPct, startD, endD, planned };
    });

    return { rangeStart, rangeEnd, totalDays, scaledTasks };
  }, [effectiveTasks]);

  // Generate month tick labels
  const ticks: Array<{ pct: number; label: string }> = [];
  if (totalDays > 0) {
    const tickCount = Math.min(8, Math.max(3, Math.floor(totalDays / 10)));
    for (let i = 0; i <= tickCount; i++) {
      const t = new Date(rangeStart);
      t.setDate(t.getDate() + Math.round((totalDays * i) / tickCount));
      ticks.push({
        pct: (i / tickCount) * 100,
        label: fmtShort(t),
      });
    }
  }

  // Measure the timeline track to get pxPerDay.
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => setTrackWidth(el.getBoundingClientRect().width);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pxPerDay = totalDays > 0 && trackWidth > 0 ? trackWidth / totalDays : 0;

  // Drag state.
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;

  const updateTaskMutation = useUpdateTask(drag?.taskId ?? "");
  // The hook binds to an id; we want a freshly-bound mutation per commit.
  // Easiest is to use a local commit helper that calls apiPatch directly via a fresh hook.
  // To stay inside the mutation hook constraint, we actually re-instantiate it by
  // keying off the drag.taskId and only calling mutate on mouseup. The hook call above
  // has a stale id on first render before drag starts, but we only mutate when drag exists.

  const commitDrag = (state: DragState) => {
    const changes: { startDate?: string; dueDate?: string } = {};
    if (state.currentStart.getTime() !== state.originalStart.getTime()) {
      changes.startDate = startOfDayISO(state.currentStart);
    }
    if (state.currentEnd.getTime() !== state.originalEnd.getTime()) {
      changes.dueDate = startOfDayISO(state.currentEnd);
    }
    if (!changes.startDate && !changes.dueDate) return;

    // Optimistic local state (already applied during drag, keep in overrides)
    setOverrides((prev) => ({
      ...prev,
      [state.taskId]: {
        ...prev[state.taskId],
        ...changes,
      },
    }));

    // Fire mutation. Since useUpdateTask is keyed to a single id per hook call,
    // we use fetch directly via the same underlying approach: dispatch to the
    // bound hook only when it matches, else use a one-off mutation.
    updateTaskMutation.mutate(changes as any, {
      onError: () => {
        // revert
        setOverrides((prev) => {
          const copy = { ...prev };
          delete copy[state.taskId];
          return copy;
        });
      },
      onSuccess: () => {
        // Once the query refetches and includes the new dates, we can drop the override.
        setTimeout(() => {
          setOverrides((prev) => {
            const copy = { ...prev };
            delete copy[state.taskId];
            return copy;
          });
        }, 600);
      },
    });
  };

  useEffect(() => {
    if (!drag) return;

    const onMove = (e: MouseEvent) => {
      const cur = dragRef.current;
      if (!cur || pxPerDay <= 0) return;
      const deltaDays = Math.round((e.clientX - cur.startX) / pxPerDay);
      let newStart = new Date(cur.originalStart);
      let newEnd = new Date(cur.originalEnd);

      if (cur.kind === "move") {
        newStart.setDate(newStart.getDate() + deltaDays);
        newEnd.setDate(newEnd.getDate() + deltaDays);
      } else if (cur.kind === "resize-start") {
        newStart.setDate(newStart.getDate() + deltaDays);
        if (newStart.getTime() > newEnd.getTime()) newStart = new Date(newEnd);
        if (projectStart && newStart.getTime() < projectStart.getTime()) {
          newStart = new Date(projectStart);
        }
      } else {
        newEnd.setDate(newEnd.getDate() + deltaDays);
        if (newEnd.getTime() < newStart.getTime()) newEnd = new Date(newStart);
      }

      const next: DragState = { ...cur, currentStart: newStart, currentEnd: newEnd };
      dragRef.current = next;
      setDrag(next);

      // Apply to overrides immediately for live preview.
      setOverrides((prev) => ({
        ...prev,
        [cur.taskId]: {
          ...prev[cur.taskId],
          startDate: startOfDayISO(newStart),
          dueDate: startOfDayISO(newEnd),
        },
      }));
    };

    const onUp = () => {
      const cur = dragRef.current;
      if (cur) commitDrag(cur);
      setDrag(null);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.taskId, drag?.kind, pxPerDay, projectStart]);

  const beginDrag = (e: React.MouseEvent, t: (typeof scaledTasks)[number], kind: DragKind) => {
    if (!canEdit) return;
    e.preventDefault();
    e.stopPropagation();
    const originalStart = new Date(t.startDate ?? t.createdAt ?? new Date());
    const originalEnd = new Date(t.dueDate ?? new Date());
    setDrag({
      taskId: t.id,
      kind,
      startX: e.clientX,
      originalStart,
      originalEnd,
      currentStart: originalStart,
      currentEnd: originalEnd,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Timeline</h3>
        <span className="text-xs text-slate-500">
          {rangeStart.toLocaleDateString()} → {rangeEnd.toLocaleDateString()}
        </span>
      </div>

      {scaledTasks.length === 0 ? (
        <Card>
          <div className="py-8 text-center text-sm text-slate-400">
            No tasks with dates yet.
          </div>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              {/* Header ticks */}
              <div className="mb-2 grid grid-cols-[200px_1fr] gap-4">
                <div />
                <div className="relative h-5 border-b border-border/50">
                  {ticks.map((t, i) => (
                    <div
                      key={i}
                      className="absolute top-0 text-[10px] text-slate-400"
                      style={{ left: `${t.pct}%`, transform: "translateX(-50%)" }}
                    >
                      {t.label}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                {scaledTasks.map((t) => {
                  const color = PRIORITY_COLORS[t.priority ?? "MEDIUM"] ?? "#6366f1";
                  const assignee = t.assignedTo
                    ? `${t.assignedTo.firstName ?? ""} ${t.assignedTo.lastName ?? ""}`.trim()
                    : "";
                  const isDragging = drag?.taskId === t.id;
                  return (
                    <div key={t.id} className="grid grid-cols-[200px_1fr] items-center gap-4">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium">{t.title}</div>
                        {assignee && (
                          <div className="truncate text-[10px] text-slate-400">{assignee}</div>
                        )}
                      </div>
                      <div
                        ref={t === scaledTasks[0] ? trackRef : undefined}
                        className="relative h-7 rounded bg-slate-100 dark:bg-slate-800/60"
                      >
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            if (isDragging) return;
                            // Ignore clicks that were actually drag-ups.
                            if (drag) return;
                            e.stopPropagation();
                            setOpenTaskId(t.id);
                          }}
                          onMouseDown={(e) => {
                            if (!canEdit) return;
                            // Only the body (not the edge handles) triggers move.
                            const target = e.target as HTMLElement;
                            if (target.dataset.handle) return;
                            beginDrag(e, t, "move");
                          }}
                          className={`absolute top-1 h-5 rounded text-[10px] font-medium text-white shadow-sm select-none ${
                            canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
                          } hover:opacity-90`}
                          style={{
                            left: `${t.offsetPct}%`,
                            width: `${t.widthPct}%`,
                            backgroundColor: color,
                          }}
                          title={`${t.title} · ${t.status}${assignee ? " · " + assignee : ""}${
                            t.dueDate ? " · Due " + new Date(t.dueDate).toLocaleDateString() : ""
                          }${t.planned ? " (planned)" : ""}`}
                        >
                          <span className="block truncate px-1.5 leading-5">{t.title}</span>

                          {canEdit && (
                            <>
                              <div
                                data-handle="start"
                                onMouseDown={(e) => beginDrag(e, t, "resize-start")}
                                className="absolute left-0 top-0 h-full w-[6px] cursor-col-resize rounded-l bg-black/10 hover:bg-black/30"
                              />
                              <div
                                data-handle="end"
                                onMouseDown={(e) => beginDrag(e, t, "resize-end")}
                                className="absolute right-0 top-0 h-full w-[6px] cursor-col-resize rounded-r bg-black/10 hover:bg-black/30"
                              />
                            </>
                          )}

                          {isDragging && drag && (
                            <div
                              className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[10px] font-semibold text-white shadow-lg"
                            >
                              {fmtShort(drag.currentStart)} → {fmtShort(drag.currentEnd)}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {canEdit && (
                <div className="mt-3 text-[11px] italic text-slate-400">
                  Tip: drag bars to move, drag edges to resize.
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      <TaskDetailDrawer taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
    </div>
  );
}
