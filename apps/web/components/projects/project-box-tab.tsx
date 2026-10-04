"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, AlertTriangle, Scale } from "lucide-react";
import { useProjectWorkload } from "@/lib/api/hooks";
import { apiPost } from "@/lib/api/client";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/hooks/use-toast";

const STATUS_COLORS: Record<string, string> = {
  BACKLOG: "#94a3b8",
  TODO: "#06b6d4",
  IN_PROGRESS: "#f59e0b",
  REVIEW: "#8b5cf6",
  BLOCKED: "#ef4444",
  DONE: "#22c55e",
};

const STATUS_LABELS: Record<string, string> = {
  BACKLOG: "Backlog",
  TODO: "Ready",
  IN_PROGRESS: "In progress",
  REVIEW: "Review",
  BLOCKED: "Blocked",
  DONE: "Done",
};

const STATUS_ORDER = ["BACKLOG", "TODO", "IN_PROGRESS", "REVIEW", "BLOCKED", "DONE"] as const;

const AVATAR_COLORS = [
  "bg-rose-500",
  "bg-pink-500",
  "bg-purple-500",
  "bg-indigo-500",
  "bg-blue-500",
  "bg-cyan-500",
  "bg-teal-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-orange-500",
];

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h << 5) - h + str.charCodeAt(i);
  return Math.abs(h);
}

function initials(firstName?: string, lastName?: string, fallback?: string): string {
  const f = (firstName ?? "").trim();
  const l = (lastName ?? "").trim();
  if (f || l) return `${f.charAt(0)}${l.charAt(0)}`.toUpperCase() || "?";
  if (fallback) return fallback.slice(0, 2).toUpperCase();
  return "?";
}

function formatEstimate(mins: number): string {
  if (!mins || mins <= 0) return "—";
  const dayMins = 8 * 60;
  const days = Math.floor(mins / dayMins);
  const rem = mins - days * dayMins;
  const hours = Math.floor(rem / 60);
  const m = mins % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (!days && !hours && m) parts.push(`${m}m`);
  return parts.join(" ") || "—";
}

function formatHrs(hrs: number | null | undefined): string {
  if (hrs === null || hrs === undefined || hrs === 0) return "—";
  if (hrs < 1) return `${hrs}h`;
  return `${hrs}h`;
}

type Task = {
  id: string;
  title: string;
  status: string;
  priority?: string;
  estimatedHrs?: number | null;
  dueDate?: string | null;
};

type Box = {
  user: { id: string; firstName?: string; lastName?: string; email?: string; avatarUrl?: string | null };
  totals: {
    tasks: number;
    done: number;
    notDone: number;
    percentDone: number;
    estimatedMinutesNotDone: number;
    estimatedMinutesDone: number;
    loggedMinutes: number;
    tasksWithoutEstimate: number;
  };
  byStatus: Record<string, Task[]>;
  capacity?: {
    weeklyHours?: number;
    /** Total available hours across the whole project (weeklyHours × projectWeeks). */
    availableHours?: number;
    projectWeeks?: number;
    committedHours?: number;
    percentUsed?: number;
    overCommitted?: boolean;
  };
};

type WorkloadData = {
  project: { id: string; name: string };
  workload: Array<{ userId: string; name: string; avatarUrl?: string | null; totalTasks: number; done: number; notDone: number }>;
  boxes: Box[];
  unassigned: null | {
    totals: { tasks: number; done: number; notDone: number };
    tasks: Task[];
  };
};

function Avatar({
  firstName,
  lastName,
  name,
  size = 28,
}: {
  firstName?: string;
  lastName?: string;
  name?: string;
  size?: number;
}) {
  const key = `${firstName ?? ""}${lastName ?? ""}${name ?? ""}` || "anon";
  const color = AVATAR_COLORS[hashString(key) % AVATAR_COLORS.length];
  const inits = initials(firstName, lastName, name);
  return (
    <div
      className={`flex items-center justify-center rounded-full text-white font-semibold ${color}`}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.floor(size / 2.5)) }}
    >
      {inits}
    </div>
  );
}

function Donut({
  percent,
  size = 56,
  stroke = 8,
  label,
  color = "#22c55e",
}: {
  percent: number;
  size?: number;
  stroke?: number;
  label?: string;
  color?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = c - (clamped / 100) * c;
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#e5e7eb" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute text-xs font-semibold text-slate-700 dark:text-slate-200">
        {label ?? `${Math.round(clamped)}%`}
      </span>
    </div>
  );
}

function StatusBar({ byStatus }: { byStatus: Record<string, Task[]> }) {
  const counts = STATUS_ORDER.map((s) => ({ key: s, count: byStatus[s]?.length ?? 0 }));
  const total = counts.reduce((a, b) => a + b.count, 0);
  if (total === 0) {
    return <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700" />;
  }
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
      {counts
        .filter((c) => c.count > 0)
        .map((c) => (
          <div
            key={c.key}
            style={{ width: `${(c.count / total) * 100}%`, backgroundColor: STATUS_COLORS[c.key] }}
          />
        ))}
    </div>
  );
}

function WorkloadChart({
  workload,
  boxes,
}: {
  workload: WorkloadData["workload"];
  boxes: WorkloadData["boxes"];
}) {
  // Anchor the bar height to CAPACITY HOURS (not raw task count) so a
  // person at 310% looks ~3x taller than one at 100%. The previous
  // chart used task count which made over-commitment invisible.
  const capacityByUser = new Map(
    (boxes ?? []).map((b) => [b.user.id, { percentUsed: b.capacity?.percentUsed ?? 0, hrs: b.capacity?.committedHours ?? 0 }]),
  );
  const maxPct = Math.max(100, ...workload.map((w) => capacityByUser.get(w.userId)?.percentUsed ?? 0));
  const chartHeight = 160;
  // Slice of the bar above 100% capacity — we render it as a striped
  // red zone so over-commitment reads at a glance.
  const capLineY = (100 / maxPct) * chartHeight;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Workload</h3>
        <span className="text-xs text-slate-500">{workload.length} {workload.length === 1 ? "person" : "people"}</span>
      </div>
      {workload.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-sm text-slate-400">No assignments</div>
      ) : (
        <div className="relative flex items-end gap-3" style={{ height: chartHeight + 56 }}>
          {/* 100% capacity reference line */}
          {maxPct > 100 && (
            <div
              className="pointer-events-none absolute inset-x-0 z-0 flex items-center"
              style={{ bottom: capLineY + 56 }}
            >
              <div className="h-px w-full border-t border-dashed border-slate-400/60" />
              <span className="absolute right-0 -translate-y-3 rounded bg-slate-100 px-1 text-[9px] font-semibold text-slate-500 dark:bg-slate-800">
                100%
              </span>
            </div>
          )}
          {workload.map((w) => {
            const cap = capacityByUser.get(w.userId);
            const pct = cap?.percentUsed ?? 0;
            const h = (pct / maxPct) * chartHeight;
            const safePart = (Math.min(100, pct) / maxPct) * chartHeight;
            const overPart = Math.max(0, h - safePart);
            const over = pct > 100;
            return (
              <div key={w.userId} className="relative z-10 flex flex-1 flex-col items-center gap-2">
                <div className="flex w-full flex-col items-center justify-end" style={{ height: chartHeight }}>
                  <div
                    className="relative w-full max-w-[36px] overflow-hidden rounded-md bg-slate-200 dark:bg-slate-700"
                    style={{ height: Math.max(4, h) }}
                    title={`${pct}% · ${Math.round(cap?.hrs ?? 0)}h`}
                  >
                    {/* Safe (≤100%) portion — primary colour */}
                    <div
                      className="absolute inset-x-0 bottom-0 bg-primary"
                      style={{ height: safePart }}
                    />
                    {/* Overage portion — red diagonal stripe so it's
                        impossible to miss visually */}
                    {overPart > 0 && (
                      <div
                        className="absolute inset-x-0 bg-red-500"
                        style={{
                          bottom: safePart,
                          height: overPart,
                          backgroundImage:
                            "repeating-linear-gradient(45deg, transparent 0 4px, rgba(255,255,255,0.25) 4px 8px)",
                        }}
                      />
                    )}
                  </div>
                </div>
                <Avatar name={w.name} size={28} />
                <span className="w-full truncate text-center text-[10px] text-slate-500">{w.name}</span>
                <span className={`text-[10px] font-semibold tabular-nums ${over ? "text-red-600 dark:text-red-400" : "text-slate-500"}`}>
                  {pct}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TaskRow({ task, onOpen }: { task: Task; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(task.id)}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
    >
      <span
        className="h-2 w-2 flex-shrink-0 rounded-full"
        style={{ backgroundColor: STATUS_COLORS[task.status] ?? "#94a3b8" }}
      />
      <span className="flex-1 truncate text-slate-800 dark:text-slate-200">{task.title}</span>
      <span className="text-xs text-slate-500">{formatHrs(task.estimatedHrs ?? null)}</span>
    </button>
  );
}

function StatusSection({
  statusKey,
  tasks,
  onOpen,
}: {
  statusKey: string;
  tasks: Task[];
  onOpen: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (tasks.length === 0) return null;
  return (
    <div className="border-t border-slate-100 py-1 dark:border-slate-800">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: STATUS_COLORS[statusKey] ?? "#94a3b8" }}
        />
        <span>{STATUS_LABELS[statusKey] ?? statusKey}</span>
        <span className="ml-1 font-normal text-slate-400">({tasks.length})</span>
      </button>
      {open && (
        <div className="mt-1 flex flex-col gap-0.5 pl-2">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  );
}

function BoxCard({ box, onOpen }: { box: Box; onOpen: (id: string) => void }) {
  const [expanded, setExpanded] = useState(true);
  const { user, totals, byStatus } = box;
  const displayName = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email || "Unknown";
  const remainingHrs = Math.round(totals.estimatedMinutesNotDone / 60);

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center gap-2">
        <Avatar firstName={user.firstName} lastName={user.lastName} size={28} />
        <span className="flex-1 truncate font-semibold text-slate-900 dark:text-slate-100">{displayName}</span>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="rounded-md p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 flex flex-col gap-3 overflow-y-auto" style={{ maxHeight: "70vh" }}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex gap-6">
              <div>
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{totals.notDone}</div>
                <div className="text-xs text-slate-500">Not done</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{totals.done}</div>
                <div className="text-xs text-slate-500">Done</div>
              </div>
            </div>
            <Donut percent={totals.percentDone} size={60} stroke={8} color="#22c55e" />
          </div>

          <StatusBar byStatus={byStatus} />

          {box.capacity && typeof box.capacity.percentUsed === "number" && (
            <div className="mt-1">
              <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <span>Capacity</span>
                <span className="tabular-nums">
                  {Math.round(box.capacity.committedHours ?? 0)}h / {Math.round(box.capacity.availableHours ?? box.capacity.weeklyHours ?? 0)}h
                  {" "}({Math.round(box.capacity.percentUsed)}%)
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div
                  className={`h-full ${box.capacity.percentUsed > 100 ? "bg-red-500" : "bg-primary"}`}
                  style={{ width: `${Math.min(100, box.capacity.percentUsed)}%` }}
                />
              </div>
              {/* Surface the "over X weeks" basis so 240h doesn't look
                  random — the user sees this is a project-duration
                  capacity number, not a single-week one. */}
              {box.capacity.projectWeeks && box.capacity.projectWeeks > 0 && (
                <div className="mt-1 text-[10px] text-slate-400">
                  {Math.round(box.capacity.weeklyHours ?? 0)}h/wk × {box.capacity.projectWeeks} project {box.capacity.projectWeeks === 1 ? "week" : "weeks"}
                </div>
              )}
              {box.capacity.overCommitted && (
                <div className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 dark:text-red-400">
                  <AlertTriangle className="size-3" />
                  Over-committed
                </div>
              )}
            </div>
          )}

          <div className="mt-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Time Estimate</div>
            <div className="mt-2 flex items-center justify-between gap-4">
              <div className="flex gap-6">
                <div>
                  <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {formatEstimate(totals.estimatedMinutesNotDone)}
                  </div>
                  <div className="text-xs text-slate-500">Not done</div>
                </div>
                <div>
                  <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {formatEstimate(totals.estimatedMinutesDone)}
                  </div>
                  <div className="text-xs text-slate-500">Done</div>
                </div>
              </div>
              <Donut
                percent={
                  totals.estimatedMinutesNotDone + totals.estimatedMinutesDone > 0
                    ? (totals.estimatedMinutesDone /
                        (totals.estimatedMinutesNotDone + totals.estimatedMinutesDone)) *
                      100
                    : 0
                }
                size={52}
                stroke={6}
                color="#6366f1"
                label={`${remainingHrs}h`}
              />
            </div>
            {totals.tasksWithoutEstimate > 0 && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle size={12} />
                <span>
                  {totals.tasksWithoutEstimate} task{totals.tasksWithoutEstimate === 1 ? "" : "s"} without estimate
                </span>
              </div>
            )}
          </div>

          <div className="mt-2">
            {STATUS_ORDER.map((s) => (
              <StatusSection key={s} statusKey={s} tasks={byStatus[s] ?? []} onOpen={onOpen} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UnassignedCard({
  unassigned,
  onOpen,
}: {
  unassigned: NonNullable<WorkloadData["unassigned"]>;
  onOpen: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="flex flex-col rounded-2xl border border-dashed border-slate-300 bg-white p-4 shadow-sm dark:border-slate-600 dark:bg-slate-900">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
          Unassigned
        </span>
        <span className="text-xs text-slate-500">{unassigned.totals.tasks} tasks</span>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="ml-auto rounded-md p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>
      {expanded && (
        <div className="mt-3 flex flex-col gap-3 overflow-y-auto" style={{ maxHeight: "70vh" }}>
          <div className="flex gap-6">
            <div>
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {unassigned.totals.notDone}
              </div>
              <div className="text-xs text-slate-500">Not done</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {unassigned.totals.done}
              </div>
              <div className="text-xs text-slate-500">Done</div>
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
            {unassigned.tasks.map((t) => (
              <TaskRow key={t.id} task={t} onOpen={onOpen} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ProjectBoxTab({ projectId }: { projectId: string }) {
  const { data, isLoading, isError } = useProjectWorkload(projectId);
  const router = useRouter();
  const qc = useQueryClient();

  const handleOpen = (id: string) => {
    router.push(`/tasks?openTask=${id}`);
  };

  // Rebalance mutation — calls the new endpoint and refetches.
  const rebalanceMutation = useMutation({
    mutationFn: () =>
      apiPost<{ moved: number; assigned: number; message: string }>(
        `/projects/${projectId}/rebalance-workload`,
        {},
      ),
    onSuccess: (result) => {
      toast({
        variant: "success",
        title: "Workload rebalanced",
        description: result.message,
        duration: 8_000,
      });
      void qc.invalidateQueries({ queryKey: ["project-workload", projectId] });
      void qc.invalidateQueries({ queryKey: ["project", projectId] });
      void qc.invalidateQueries({ queryKey: ["project-tasks", projectId] });
    },
    onError: (err: Error) =>
      toast({ variant: "error", title: "Couldn't rebalance", description: err.message }),
  });

  const typed = useMemo(() => data as WorkloadData | undefined, [data]);

  if (isLoading) return <LoadingState label="Loading workload..." />;
  if (isError || !typed) return <ErrorState label="Unable to load workload." />;

  // Surface the over-commitment count + unassigned count up top so the
  // user sees the problem at a glance and the fix button is right there.
  const overCommittedCount = (typed.boxes ?? []).filter((b) => b.capacity?.overCommitted).length;
  const unassignedCount = typed.unassigned?.totals.tasks ?? 0;
  const needsAttention = overCommittedCount > 0 || unassignedCount > 0;

  return (
    <div className="space-y-4">
      {needsAttention && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/20">
          <div className="flex items-start gap-3">
            <AlertTriangle className="size-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="text-sm">
              <div className="font-semibold text-amber-900 dark:text-amber-100">
                Workload needs rebalancing
              </div>
              <div className="text-xs text-amber-800 dark:text-amber-200">
                {overCommittedCount > 0 && (
                  <span>
                    {overCommittedCount} {overCommittedCount === 1 ? "person is" : "people are"} over-committed
                  </span>
                )}
                {overCommittedCount > 0 && unassignedCount > 0 && <span> · </span>}
                {unassignedCount > 0 && (
                  <span>
                    {unassignedCount} unassigned task{unassignedCount === 1 ? "" : "s"}
                  </span>
                )}
              </div>
            </div>
          </div>
          <Button
            onClick={() => rebalanceMutation.mutate()}
            disabled={rebalanceMutation.isPending}
          >
            <Scale className="mr-2 size-4" />
            {rebalanceMutation.isPending ? "Rebalancing…" : "Rebalance team"}
          </Button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <WorkloadChart workload={typed.workload ?? []} boxes={typed.boxes ?? []} />
        {(typed.boxes ?? []).map((box) => (
          <BoxCard key={box.user.id} box={box} onOpen={handleOpen} />
        ))}
        {typed.unassigned && <UnassignedCard unassigned={typed.unassigned} onOpen={handleOpen} />}
      </div>
    </div>
  );
}

export default ProjectBoxTab;
