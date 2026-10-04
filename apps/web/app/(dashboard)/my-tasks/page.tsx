"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, AlertTriangle, Calendar, Clock } from "lucide-react";
import { ModuleHeader } from "@/components/layout/module-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { TaskDetailDrawer } from "@/components/tasks/task-detail-drawer";
import { useTasks, useUsers } from "@/lib/api/hooks";
import { useUpdateTask } from "@/lib/api/mutations";
import { useAuthStore } from "@/lib/store/auth-store";
import { toArray, cn } from "@/lib/utils";

interface MyTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  projectId?: string;
  project?: { id?: string; name?: string } | null;
  assignedToId?: string | null;
  dueDate?: string | null;
  completedAt?: string | null;
  updatedAt?: string | null;
}

const PRIORITY_META: Record<string, { label: string; className: string }> = {
  URGENT: { label: "Urgent", className: "bg-red-500/10 text-red-700 dark:text-red-300" },
  HIGH: { label: "High", className: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  MEDIUM: { label: "Medium", className: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  LOW: { label: "Low", className: "bg-slate-500/10 text-slate-600 dark:text-slate-300" },
};

function PriorityPill({ value }: { value: string }) {
  const meta = PRIORITY_META[value] ?? { label: value, className: "bg-slate-500/10 text-slate-600" };
  return (
    <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium", meta.className)}>
      {meta.label}
    </span>
  );
}

function KpiCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number | string;
  tone?: "default" | "warning" | "danger" | "success";
  icon?: React.ReactNode;
}) {
  const toneClass =
    tone === "danger"
      ? "text-red-600 dark:text-red-400"
      : tone === "warning"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "success"
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-slate-900 dark:text-white";
  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</p>
        {icon && <span className="text-slate-300">{icon}</span>}
      </div>
      <p className={cn("mt-2 text-2xl font-semibold tracking-tight", toneClass)}>{value}</p>
    </Card>
  );
}

function TaskRow({
  task,
  onOpen,
  onMarkDone,
  busy,
}: {
  task: MyTask;
  onOpen: () => void;
  onMarkDone: () => void;
  busy: boolean;
}) {
  const due = task.dueDate ? new Date(task.dueDate) : null;
  const isOverdue = due ? due.getTime() < Date.now() && task.status !== "DONE" : false;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      className="group flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-slate-900 dark:text-white">
          {task.title}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-slate-500">
          {task.project?.name ?? "—"}
        </div>
      </div>
      <PriorityPill value={task.priority} />
      <div className={cn(
        "w-[100px] shrink-0 text-right text-xs tabular-nums",
        isOverdue ? "text-red-600 dark:text-red-400 font-medium" : "text-slate-500",
      )}>
        {due ? due.toLocaleDateString() : "—"}
      </div>
      {task.status !== "DONE" && (
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            onMarkDone();
          }}
          className="shrink-0"
        >
          <CheckCircle2 className="mr-1 size-3" /> Done
        </Button>
      )}
      {task.status === "DONE" && (
        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="size-3" /> Done
        </span>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  tone,
  icon,
  children,
}: {
  title: string;
  count: number;
  tone?: "danger" | "warning" | "default" | "success";
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  const toneClass =
    tone === "danger"
      ? "text-red-600 dark:text-red-400"
      : tone === "warning"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "success"
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-slate-700 dark:text-slate-200";
  return (
    <Card>
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <h3 className={cn("text-sm font-semibold", toneClass)}>{title}</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          {count}
        </span>
      </div>
      <div className="divide-y divide-border/40">{children}</div>
    </Card>
  );
}

function MarkDoneCell({
  task,
  onOpen,
}: {
  task: MyTask;
  onOpen: () => void;
}) {
  const update = useUpdateTask(task.id);
  return (
    <TaskRow
      task={task}
      onOpen={onOpen}
      busy={update.isPending}
      onMarkDone={() => update.mutate({ status: "DONE" } as any)}
    />
  );
}

export default function MyTasksPage() {
  const searchParams = useSearchParams();
  const queryUserId = searchParams?.get("userId") ?? null;
  const selfId = useAuthStore((s) => s.user?.id);
  const roles = useAuthStore((s) => s.user?.roles ?? []);
  const isAdmin = roles.some((r) => ["SUPER_ADMIN", "ADMIN"].includes(r));
  // When a ?userId is in the URL (Resources → "View tasks" links), admins
  // view that person's board instead of their own. Non-admins ignore the
  // parameter — they're scoped to themselves regardless.
  const viewingUserId = isAdmin ? (queryUserId ?? selfId ?? null) : selfId ?? null;
  const isViewingOther = !!queryUserId && queryUserId !== selfId && isAdmin;

  // Admins see every task by default unless scoped — pass userId to scope.
  const tasksQuery = useTasks(isAdmin ? (viewingUserId ?? undefined) : undefined);

  // Look up the viewed user's display name so the header reads
  // "Aarav Kapoor's tasks" instead of always "My Tasks".
  const usersQuery = useUsers({ includeInactive: true });
  const viewedUser = useMemo(() => {
    if (!isViewingOther || !queryUserId) return null;
    const list = (usersQuery.data?.data ?? []) as Array<{
      id: string; firstName?: string; lastName?: string; email: string;
    }>;
    const u = list.find((x) => x.id === queryUserId);
    if (!u) return null;
    const full = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
    return full || u.email;
  }, [usersQuery.data, queryUserId, isViewingOther]);

  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const allTasks = useMemo(() => toArray<MyTask>(tasksQuery.data), [tasksQuery.data]);

  const myTasks = useMemo(
    () => (viewingUserId ? allTasks.filter((t) => t.assignedToId === viewingUserId) : allTasks),
    [allTasks, viewingUserId],
  );

  const buckets = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);
    const startOfWeek = new Date(startOfToday);
    const dow = (startOfWeek.getDay() + 6) % 7;
    startOfWeek.setDate(startOfWeek.getDate() - dow);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 7);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const sevenDaysAgo = new Date(startOfToday);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const overdue: MyTask[] = [];
    const today: MyTask[] = [];
    const thisWeek: MyTask[] = [];
    const later: MyTask[] = [];
    const doneRecently: MyTask[] = [];

    for (const t of myTasks) {
      if (t.status === "DONE") {
        const completedIso = t.completedAt ?? t.updatedAt;
        if (completedIso) {
          const c = new Date(completedIso);
          if (c >= sevenDaysAgo) doneRecently.push(t);
        }
        continue;
      }
      const due = t.dueDate ? new Date(t.dueDate) : null;
      if (due && due < startOfToday) {
        overdue.push(t);
      } else if (due && due >= startOfToday && due < endOfToday) {
        today.push(t);
      } else if (due && due >= endOfToday && due < endOfWeek) {
        thisWeek.push(t);
      } else {
        later.push(t);
      }
    }

    // Sort helpers
    const byDue = (a: MyTask, b: MyTask) => {
      const ad = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
      const bd = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
      return ad - bd;
    };
    overdue.sort(byDue);
    today.sort(byDue);
    thisWeek.sort(byDue);
    later.sort(byDue);
    doneRecently.sort((a, b) => {
      const ad = new Date(a.completedAt ?? a.updatedAt ?? 0).getTime();
      const bd = new Date(b.completedAt ?? b.updatedAt ?? 0).getTime();
      return bd - ad;
    });

    const activeThisWeek =
      overdue.length + today.length + thisWeek.length;

    // "Completed this month" — DONE with completedAt/updatedAt in current month
    let completedThisMonth = 0;
    for (const t of myTasks) {
      if (t.status !== "DONE") continue;
      const c = t.completedAt ?? t.updatedAt;
      if (!c) continue;
      if (new Date(c) >= startOfMonth) completedThisMonth += 1;
    }

    return {
      overdue,
      today,
      thisWeek,
      later,
      doneRecently,
      kpis: {
        total: myTasks.filter((t) => t.status !== "DONE").length,
        dueThisWeek: activeThisWeek,
        overdue: overdue.length,
        completedThisMonth,
      },
    };
  }, [myTasks]);

  if (tasksQuery.isLoading) return <LoadingState label="Loading your tasks..." />;
  if (tasksQuery.isError) return <ErrorState label="Unable to load your tasks." />;

  const { overdue, today, thisWeek, later, doneRecently, kpis } = buckets;
  const hasAny = overdue.length + today.length + thisWeek.length + later.length + doneRecently.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <ModuleHeader
        module="tasks"
        title={isViewingOther ? `${viewedUser ?? "Teammate"}'s tasks` : "My Tasks"}
        description={
          isViewingOther
            ? "Active assignments for this teammate, grouped by urgency."
            : "Everything assigned to you, grouped by urgency."
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label={isViewingOther ? "Active tasks" : "My total tasks"} value={kpis.total} icon={<Calendar className="size-4" />} />
        <KpiCard
          label="Due this week"
          value={kpis.dueThisWeek}
          tone={kpis.dueThisWeek > 0 ? "warning" : "default"}
          icon={<Clock className="size-4" />}
        />
        <KpiCard
          label="Overdue"
          value={kpis.overdue}
          tone={kpis.overdue > 0 ? "danger" : "default"}
          icon={<AlertTriangle className="size-4" />}
        />
        <KpiCard
          label="Completed this month"
          value={kpis.completedThisMonth}
          tone="success"
          icon={<CheckCircle2 className="size-4" />}
        />
      </div>

      {!hasAny ? (
        <Card>
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <CheckCircle2 className="size-10 text-emerald-500" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {isViewingOther
                ? `${viewedUser ?? "This teammate"} has nothing on their plate right now.`
                : "You’re all caught up."}
            </p>
            <p className="text-xs text-slate-500">
              {isViewingOther ? "No active tasks assigned." : "No tasks assigned to you right now."}
            </p>
            <Link
              href="/tasks"
              className="mt-2 text-xs text-primary underline-offset-4 hover:underline"
            >
              Browse the team board →
            </Link>
          </div>
        </Card>
      ) : (
        <>
          <Section
            title="Overdue"
            count={overdue.length}
            tone="danger"
            icon={<AlertTriangle className="size-4 text-red-500" />}
          >
            {overdue.map((t) => (
              <MarkDoneCell key={t.id} task={t} onOpen={() => setOpenTaskId(t.id)} />
            ))}
          </Section>

          <Section
            title="Today"
            count={today.length}
            icon={<Calendar className="size-4 text-slate-500" />}
          >
            {today.map((t) => (
              <MarkDoneCell key={t.id} task={t} onOpen={() => setOpenTaskId(t.id)} />
            ))}
          </Section>

          <Section
            title="This Week"
            count={thisWeek.length}
            icon={<Calendar className="size-4 text-slate-500" />}
          >
            {thisWeek.map((t) => (
              <MarkDoneCell key={t.id} task={t} onOpen={() => setOpenTaskId(t.id)} />
            ))}
          </Section>

          <Section
            title="Later"
            count={later.length}
            icon={<Clock className="size-4 text-slate-500" />}
          >
            {later.map((t) => (
              <MarkDoneCell key={t.id} task={t} onOpen={() => setOpenTaskId(t.id)} />
            ))}
          </Section>

          <Section
            title="Done recently (last 7 days)"
            count={doneRecently.length}
            tone="success"
            icon={<CheckCircle2 className="size-4 text-emerald-500" />}
          >
            {doneRecently.map((t) => (
              <MarkDoneCell key={t.id} task={t} onOpen={() => setOpenTaskId(t.id)} />
            ))}
          </Section>
        </>
      )}

      <TaskDetailDrawer taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
    </div>
  );
}
