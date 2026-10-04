"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Plus, X, Search, Kanban, Calendar, User as UserIcon, AlertTriangle, CalendarX, Download, List, LayoutGrid } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import { ModuleHeader } from "@/components/layout/module-header";
import { KanbanColumn } from "@/components/tasks/kanban-column";
import { DraggableTaskCard } from "@/components/tasks/draggable-task-card";
import { SwimLaneBoard, groupTasksBy, type GroupByKey } from "@/components/tasks/swimlane-board";
import { CreateTaskDialog } from "@/components/tasks/create-task-dialog";
import { TaskDetailDrawer } from "@/components/tasks/task-detail-drawer";
import { CreateTimeEntryDialog } from "@/components/time/create-time-entry-dialog";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useTasks, useUsers, useProjects, useLabels, useSprints } from "@/lib/api/hooks";
import { useAuthStore } from "@/lib/store/auth-store";
import { apiPatch, downloadWithAuth } from "@/lib/api/client";
import { TaskListView } from "@/components/tasks/task-list-view";
import { useDeleteTask } from "@/lib/api/mutations";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toArray, staffOnly } from "@/lib/utils";
import { toast } from "@/lib/hooks/use-toast";

const COLUMNS = ["BACKLOG", "TODO", "IN_PROGRESS", "REVIEW", "DONE", "BLOCKED"] as const;

const COLUMN_DOT_CLASS: Record<string, string> = {
  BACKLOG: "bg-slate-400",
  TODO: "bg-blue-500",
  IN_PROGRESS: "bg-amber-500",
  REVIEW: "bg-purple-500",
  DONE: "bg-emerald-500",
  BLOCKED: "bg-red-500",
};

const COLUMN_TEXT_CLASS: Record<string, string> = {
  BACKLOG: "text-slate-600 dark:text-slate-300",
  TODO: "text-blue-600 dark:text-blue-400",
  IN_PROGRESS: "text-amber-600 dark:text-amber-400",
  REVIEW: "text-purple-600 dark:text-purple-400",
  DONE: "text-emerald-600 dark:text-emerald-400",
  BLOCKED: "text-red-600 dark:text-red-400",
};

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  projectId?: string;
  project: { name: string };
  assignedTo?: { firstName: string; lastName: string } | null;
  assignedToId?: string;
  description?: string;
  dueDate?: string;
  storyPoints?: number | null;
  labels?: Array<{ id: string; name: string; color?: string | null }>;
  _count?: { comments?: number; attachments?: number };
}

interface UserRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface ProjectRow {
  id: string;
  name: string;
}

interface LabelRow {
  id: string;
  name: string;
}

export default function TasksPage() {
  const query = useTasks();
  const qc = useQueryClient();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const roles = useAuthStore((s) => s.user?.roles ?? []);
  const isAdmin = roles.some((r) =>
    ["SUPER_ADMIN", "ADMIN", "PROJECT_MANAGER", "HR_MANAGER"].includes(r),
  );
  const usersQuery = useUsers();
  const projectsQuery = useProjects();
  const labelsQuery = useLabels();

  const [createOpen, setCreateOpen] = useState(false);
  const [createStatus, setCreateStatus] = useState<string | undefined>(undefined);
  const [timeDialogOpen, setTimeDialogOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  // Deep-link support: `/tasks?openTask=<id>` opens the detail drawer.
  // Used by the running-timer pill so clicking the task name jumps to it.
  // We strip the query param after consuming so reload/back doesn't re-open.
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const openTaskId = searchParams.get("openTask");
  useEffect(() => {
    if (!openTaskId) return;
    setSelectedTaskId(openTaskId);
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    params.delete("openTask");
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`);
  }, [openTaskId, pathname, router, searchParams]);

  // Filter state
  const [searchText, setSearchText] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [labelFilter, setLabelFilter] = useState("");
  const [sprintFilter, setSprintFilter] = useState("");
  // Due date filter: "" | "today" | "overdue" | "this-week" | "next-week" | "no-due" | "custom"
  const [dueFilter, setDueFilter] = useState("");
  const [customDueFrom, setCustomDueFrom] = useState<Date | undefined>();
  const [customDueTo, setCustomDueTo] = useState<Date | undefined>();
  const [onlyMine, setOnlyMine] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupByKey>("none");
  const [viewMode, setViewMode] = useState<"board" | "list">("board");
  const [exporting, setExporting] = useState(false);

  const handleExportCsv = async () => {
    if (!projectFilter) return;
    setExporting(true);
    try {
      await downloadWithAuth(
        `/tasks/export/csv?projectId=${projectFilter}`,
        `tasks-${Date.now()}.csv`,
      );
    } catch (e: any) {
      toast({ variant: "error", title: e?.message ?? "Export failed" });
    } finally {
      setExporting(false);
    }
  };

  // Sprints for current project filter (empty → no sprint options)
  const sprintsQuery = useSprints(projectFilter || undefined);
  const sprints = toArray<{ id: string; name: string; status: string }>(sprintsQuery.data);

  const deleteTask = useDeleteTask();

  // Silent mutation for drag-drop status updates (no toast spam)
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiPatch(`/tasks/${id}`, { status }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: () => toast({ variant: "error", title: "Failed to move task" }),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const tasks = useMemo(
    () => (query.data ? toArray<Task>(query.data) : []),
    [query.data],
  );

  const users = staffOnly(toArray<UserRow>(usersQuery.data));
  const projects = toArray<ProjectRow>(projectsQuery.data);
  const labels = toArray<LabelRow>(labelsQuery.data);

  const filteredTasks = useMemo(() => {
    const term = searchText.trim().toLowerCase();
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);
    // ISO week: Monday 00:00 → following Monday 00:00
    const startOfWeek = new Date(startOfToday);
    const dayOfWeek = (startOfWeek.getDay() + 6) % 7; // 0 = Monday
    startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 7);
    const startOfNextWeek = new Date(endOfWeek);
    const endOfNextWeek = new Date(startOfNextWeek);
    endOfNextWeek.setDate(endOfNextWeek.getDate() + 7);

    return tasks.filter((t) => {
      if (term && !t.title.toLowerCase().includes(term)) return false;
      if (onlyMine && currentUserId && t.assignedToId !== currentUserId) return false;
      if (assigneeFilter && t.assignedToId !== assigneeFilter) return false;
      if (priorityFilter && t.priority !== priorityFilter) return false;
      if (projectFilter && t.projectId !== projectFilter) return false;
      if (labelFilter) {
        const hasLabel = (t.labels ?? []).some((l) => l.id === labelFilter);
        if (!hasLabel) return false;
      }
      if (sprintFilter) {
        if (sprintFilter === "__none__") {
          if ((t as any).sprintId) return false;
        } else if ((t as any).sprintId !== sprintFilter) {
          return false;
        }
      }
      if (dueFilter) {
        const due = t.dueDate ? new Date(t.dueDate) : null;
        if (dueFilter === "no-due") {
          if (due) return false;
        } else if (!due) {
          return false;
        } else if (dueFilter === "today") {
          if (due < startOfToday || due >= endOfToday) return false;
        } else if (dueFilter === "overdue") {
          if (due >= startOfToday || t.status === "DONE") return false;
        } else if (dueFilter === "this-week") {
          if (due < startOfWeek || due >= endOfWeek) return false;
        } else if (dueFilter === "next-week") {
          if (due < startOfNextWeek || due >= endOfNextWeek) return false;
        } else if (dueFilter === "custom") {
          if (customDueFrom && due < customDueFrom) return false;
          if (customDueTo) {
            const inclusiveEnd = new Date(customDueTo);
            inclusiveEnd.setDate(inclusiveEnd.getDate() + 1);
            if (due >= inclusiveEnd) return false;
          }
        }
      }
      return true;
    });
  }, [
    tasks, searchText, onlyMine, currentUserId, assigneeFilter, priorityFilter,
    projectFilter, labelFilter, sprintFilter, dueFilter, customDueFrom, customDueTo,
  ]);

  const hasFilters =
    !!searchText || !!assigneeFilter || !!priorityFilter || !!projectFilter ||
    !!labelFilter || !!sprintFilter || !!dueFilter || onlyMine;

  const clearFilters = () => {
    setSearchText("");
    setAssigneeFilter("");
    setPriorityFilter("");
    setProjectFilter("");
    setLabelFilter("");
    setSprintFilter("");
    setDueFilter("");
    setCustomDueFrom(undefined);
    setCustomDueTo(undefined);
    setOnlyMine(false);
  };

  const quickChipClass = (active: boolean) =>
    `inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition ${
      active
        ? "border-primary/40 bg-primary/10 text-primary"
        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800"
    }`;

  if (query.isLoading) return <LoadingState label="Loading tasks..." />;
  if (query.isError || !query.data) return <ErrorState label="Unable to load task board." />;

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id);
    setActiveTask(task ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;

    const task = tasks.find((t) => t.id === active.id);
    if (!task) return;

    let newStatus: string | null = null;

    if (typeof over.id === "string" && over.id.startsWith("column-")) {
      newStatus = over.id.replace("column-", "");
    } else if (typeof over.id === "string" && over.id.startsWith("lane-")) {
      const m = over.id.match(/^lane-(.+)-col-([A-Z_]+)$/);
      if (m) newStatus = m[2];
    } else {
      const overTask = tasks.find((t) => t.id === over.id);
      if (overTask) newStatus = overTask.status;
    }

    if (newStatus && newStatus !== task.status && COLUMNS.includes(newStatus as typeof COLUMNS[number])) {
      qc.setQueryData(["tasks"], (old: unknown) => {
        const data = old as { data: Task[] } | undefined;
        if (!data?.data) return old;
        return {
          ...data,
          data: data.data.map((t) => t.id === task.id ? { ...t, status: newStatus } : t),
        };
      });

      statusMutation.mutate({ id: task.id, status: newStatus });
    }
  };

  const openCreateForStatus = (status?: string) => {
    setCreateStatus(status);
    setCreateOpen(true);
  };

  const handleDeleteTask = (task: Task) => {
    if (typeof window !== "undefined" && !window.confirm(`Delete task "${task.title}"?`)) return;
    deleteTask.mutate(task.id);
  };

  const totalTasks = tasks.length;

  return (
    <div className="flex flex-col gap-4">
      <ModuleHeader
        module="tasks"
        title="Kanban Board"
        description="Drag tasks between columns to change status. Click a card to view details."
        primaryAction={{
          label: "New Task",
          icon: <Plus className="mr-1 size-4" />,
          onClick: () => openCreateForStatus(undefined),
          permission: "tasks:create",
        }}
        counts={[
          { label: "in progress", value: tasks.filter((t) => t.status === "IN_PROGRESS").length, tone: "info" },
          { label: "blocked", value: tasks.filter((t) => t.status === "BLOCKED").length, tone: "destructive" },
          { label: "total", value: totalTasks },
        ]}
      />

      {/* Metrics strip — minimal status chips, separators between */}
      <div className="flex flex-wrap items-center gap-x-1 gap-y-2 text-xs">
        {COLUMNS.map((col, idx) => {
          const count = tasks.filter((t) => t.status === col).length;
          return (
            <div key={col} className="flex items-center">
              <div className="flex items-center gap-2 px-2 py-1">
                <span className={`size-2 rounded-full ${COLUMN_DOT_CLASS[col]}`} />
                <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {col.replaceAll("_", " ")}
                </span>
                <span className={`text-xs font-semibold ${COLUMN_TEXT_CLASS[col]}`}>{count}</span>
              </div>
              {idx < COLUMNS.length - 1 && (
                <span className="h-4 w-px bg-slate-200 dark:bg-slate-700" aria-hidden />
              )}
            </div>
          );
        })}
      </div>

      {/* Filter bar — condensed 2-row toolbar */}
      <div className="space-y-2">
        {/* Row 1 — Search + select filters + view toggle + export + clear */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative w-[220px] shrink-0">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search tasks…"
              className="h-8 border-slate-200 pl-8 text-xs dark:border-slate-700"
            />
          </div>
          {isAdmin && (
            <div className="w-[150px]">
              <Select
                size="sm"
                value={assigneeFilter}
                onValueChange={setAssigneeFilter}
                placeholder="Assignee"
                options={[
                  { value: "", label: "Anyone" },
                  ...users.map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName}` })),
                ]}
              />
            </div>
          )}
          <div className="w-[120px]">
            <Select
              size="sm"
              value={priorityFilter}
              onValueChange={setPriorityFilter}
              placeholder="Priority"
              options={[
                { value: "", label: "Any priority" },
                { value: "URGENT", label: "Urgent" },
                { value: "HIGH", label: "High" },
                { value: "MEDIUM", label: "Medium" },
                { value: "LOW", label: "Low" },
              ]}
            />
          </div>
          <div className="w-[160px]">
            <Select
              size="sm"
              value={projectFilter}
              onValueChange={(v) => {
                setProjectFilter(v);
                setSprintFilter("");
              }}
              placeholder="Project"
              options={[
                { value: "", label: "Any project" },
                ...projects.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
          </div>
          {projectFilter && sprints.length > 0 && (
            <div className="w-[150px]">
              <Select
                size="sm"
                value={sprintFilter}
                onValueChange={setSprintFilter}
                placeholder="Sprint"
                options={[
                  { value: "", label: "Any sprint" },
                  { value: "__none__", label: "Backlog" },
                  ...sprints.map((s) => ({
                    value: s.id,
                    label: `${s.name}${s.status === "ACTIVE" ? " · Active" : s.status === "COMPLETED" ? " · Done" : ""}`,
                  })),
                ]}
              />
            </div>
          )}
          {labels.length > 0 && (
            <div className="w-[140px]">
              <Select
                size="sm"
                value={labelFilter}
                onValueChange={setLabelFilter}
                placeholder="Label"
                options={[
                  { value: "", label: "Any label" },
                  ...labels.map((l) => ({ value: l.id, label: l.name })),
                ]}
              />
            </div>
          )}
          <div className="w-[130px]">
            <Select
              size="sm"
              value={groupBy}
              onValueChange={(v) => setGroupBy(v as GroupByKey)}
              placeholder="Group"
              options={[
                { value: "none", label: "No grouping" },
                { value: "assignee", label: "By assignee" },
                { value: "priority", label: "By priority" },
                { value: "label", label: "By label" },
              ]}
            />
          </div>
          <div className="ml-auto inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setViewMode("board")}
              className={`inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[11px] font-medium transition ${
                viewMode === "board"
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <LayoutGrid className="size-3.5" /> Board
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[11px] font-medium transition ${
                viewMode === "list"
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <List className="size-3.5" /> List
            </button>
          </div>
          {/* Export CSV is a management/reporting tool — hidden from plain employees. */}
          {isAdmin && (
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!projectFilter || exporting}
              title={projectFilter ? "Export these tasks as CSV" : "Select a project to export"}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Download className="size-3.5" /> {exporting ? "Exporting…" : "Export CSV"}
            </button>
          )}
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
            >
              <X className="size-3.5" /> Clear
            </button>
          )}
        </div>

        {/* Row 2 — Quick chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => setOnlyMine((v) => !v)} className={quickChipClass(onlyMine)}>
            <UserIcon className="size-3" /> Mine
          </button>
          <button
            type="button"
            onClick={() => setDueFilter(dueFilter === "today" ? "" : "today")}
            className={quickChipClass(dueFilter === "today")}
          >
            <Calendar className="size-3" /> Today
          </button>
          <button
            type="button"
            onClick={() => setDueFilter(dueFilter === "overdue" ? "" : "overdue")}
            className={quickChipClass(dueFilter === "overdue")}
          >
            <AlertTriangle className="size-3" /> Overdue
          </button>
          <button
            type="button"
            onClick={() => setDueFilter(dueFilter === "this-week" ? "" : "this-week")}
            className={quickChipClass(dueFilter === "this-week")}
          >
            <Calendar className="size-3" /> This week
          </button>
          <button
            type="button"
            onClick={() => setDueFilter(dueFilter === "next-week" ? "" : "next-week")}
            className={quickChipClass(dueFilter === "next-week")}
          >
            <Calendar className="size-3" /> Next week
          </button>
          <button
            type="button"
            onClick={() => setDueFilter(dueFilter === "no-due" ? "" : "no-due")}
            className={quickChipClass(dueFilter === "no-due")}
          >
            <CalendarX className="size-3" /> No date
          </button>
          <button
            type="button"
            onClick={() => setDueFilter(dueFilter === "custom" ? "" : "custom")}
            className={quickChipClass(dueFilter === "custom")}
          >
            <Calendar className="size-3" /> Custom…
          </button>
        </div>

        {dueFilter === "custom" && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-400">Between</span>
            <div className="w-[140px]">
              <DatePicker
                value={customDueFrom}
                onChange={(d) => setCustomDueFrom(d ?? undefined)}
              />
            </div>
            <span className="text-[11px] text-slate-400">and</span>
            <div className="w-[140px]">
              <DatePicker
                value={customDueTo}
                onChange={(d) => setCustomDueTo(d ?? undefined)}
                minDate={customDueFrom}
              />
            </div>
          </div>
        )}
      </div>

      {/* Board */}
      {totalTasks === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white/50 px-6 py-16 text-center dark:border-slate-700 dark:bg-slate-900/30">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Kanban className="size-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">No tasks yet</h3>
            <p className="text-sm text-slate-500">
              Create your first task to see it on the board.
            </p>
          </div>
          <Button onClick={() => openCreateForStatus(undefined)}>
            <Plus className="mr-1 size-4" /> Create Task
          </Button>
        </div>
      ) : viewMode === "list" ? (
        <TaskListView
          tasks={filteredTasks as any}
          onRowClick={(t) => setSelectedTaskId(t.id)}
          showProject
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {groupBy === "none" ? (
            <div className="flex gap-3 overflow-x-auto pb-4">
              {COLUMNS.map((col) => (
                <KanbanColumn
                  key={col}
                  status={col}
                  tasks={filteredTasks.filter((t) => t.status === col)}
                  onEditTask={(task) => setSelectedTaskId(task.id)}
                  onLogTime={() => setTimeDialogOpen(true)}
                  onAddTask={(status) => openCreateForStatus(status)}
                  onDeleteTask={(task) => handleDeleteTask(task)}
                />
              ))}
            </div>
          ) : (
            <SwimLaneBoard
              groups={groupTasksBy(filteredTasks as any, groupBy)}
              onEditTask={(task) => setSelectedTaskId(task.id)}
              onAddTask={(status) => openCreateForStatus(status)}
              onDeleteTask={(task) => handleDeleteTask(task as any)}
            />
          )}

          <DragOverlay>
            {activeTask && (
              <DraggableTaskCard task={activeTask} onEdit={() => {}} overlay />
            )}
          </DragOverlay>
        </DndContext>
      )}

      <CreateTimeEntryDialog open={timeDialogOpen} onOpenChange={setTimeDialogOpen} />

      <CreateTaskDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setCreateStatus(undefined);
        }}
        defaultStatus={createStatus}
      />

      <TaskDetailDrawer taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
    </div>
  );
}
