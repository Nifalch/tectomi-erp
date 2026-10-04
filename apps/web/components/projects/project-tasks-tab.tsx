"use client";

import { useMemo, useState } from "react";
import {
  Plus,
  X,
  Search,
  Kanban,
  Calendar,
  User as UserIcon,
  AlertTriangle,
  CalendarX,
  Download,
  List,
  LayoutGrid,
} from "lucide-react";
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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { KanbanColumn } from "@/components/tasks/kanban-column";
import { DraggableTaskCard } from "@/components/tasks/draggable-task-card";
import { SwimLaneBoard, groupTasksBy, type GroupByKey } from "@/components/tasks/swimlane-board";
import { CreateTaskDialog } from "@/components/tasks/create-task-dialog";
import { TaskDetailDrawer } from "@/components/tasks/task-detail-drawer";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  useProject,
  useProjectTasks,
  useUsers,
  useLabels,
  useSprints,
  useProjectStatuses,
} from "@/lib/api/hooks";
import { useAuthStore } from "@/lib/store/auth-store";
import { apiPatch, downloadWithAuth } from "@/lib/api/client";
import { TaskListView } from "@/components/tasks/task-list-view";
import { useDeleteTask } from "@/lib/api/mutations";
import { toArray, staffOnly } from "@/lib/utils";
import { toast } from "@/lib/hooks/use-toast";

const DEFAULT_STATUS_KEYS = ["BACKLOG", "TODO", "IN_PROGRESS", "REVIEW", "DONE", "BLOCKED"] as const;

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

interface BoardColumn {
  key: string;
  label: string;
  /** Hex color for custom statuses; undefined for enum defaults. */
  color?: string;
  /** Coarse category — only meaningful for custom statuses. */
  category?: "TODO" | "IN_PROGRESS" | "DONE";
  isCustom: boolean;
}

const DEFAULT_COLUMNS: BoardColumn[] = DEFAULT_STATUS_KEYS.map((k) => ({
  key: k,
  label: k.replaceAll("_", " "),
  isCustom: false,
}));

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
  sprintId?: string | null;
  labels?: Array<{ id: string; name: string; color?: string | null }>;
  _count?: { comments?: number; attachments?: number };
  customStatusId?: string | null;
  customStatus?: {
    id: string;
    name: string;
    color: string;
    category: "TODO" | "IN_PROGRESS" | "DONE";
    sortOrder?: number;
  } | null;
}

interface CustomStatusRow {
  id: string;
  name: string;
  color: string;
  category: "TODO" | "IN_PROGRESS" | "DONE";
  sortOrder?: number;
}

interface UserRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface LabelRow {
  id: string;
  name: string;
}

interface SprintRow {
  id: string;
  name: string;
  status: string;
}

const quickChipClass = (active: boolean) =>
  `inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition ${
    active
      ? "border-primary/40 bg-primary/10 text-primary"
      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800"
  }`;

export function ProjectTasksTab({ projectId }: { projectId: string }) {
  const query = useProjectTasks(projectId);
  const projectQuery = useProject(projectId);
  const qc = useQueryClient();

  const currentUserId = useAuthStore((s) => s.user?.id);
  const roles = useAuthStore((s) => s.user?.roles ?? []);
  const isAdmin = roles.some((r) =>
    ["SUPER_ADMIN", "ADMIN", "PROJECT_MANAGER", "HR_MANAGER"].includes(r),
  );

  const usersQuery = useUsers();
  const labelsQuery = useLabels(projectId);
  const sprintsQuery = useSprints(projectId);
  const statusesQuery = useProjectStatuses(projectId);

  const customStatuses = useMemo(
    () =>
      toArray<CustomStatusRow>(statusesQuery.data).sort(
        (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
      ),
    [statusesQuery.data],
  );
  const hasCustom = customStatuses.length > 0;
  const columns = useMemo<BoardColumn[]>(
    () =>
      hasCustom
        ? customStatuses.map((s) => ({
            key: s.id,
            label: s.name,
            color: s.color,
            category: s.category,
            isCustom: true,
          }))
        : DEFAULT_COLUMNS,
    [hasCustom, customStatuses],
  );
  const columnKeys = useMemo(() => new Set(columns.map((c) => c.key)), [columns]);

  const [createOpen, setCreateOpen] = useState(false);
  const [createStatus, setCreateStatus] = useState<string | undefined>(undefined);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  // Filters
  const [searchText, setSearchText] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [labelFilter, setLabelFilter] = useState("");
  const [sprintFilter, setSprintFilter] = useState("");
  const [dueFilter, setDueFilter] = useState("");
  const [customDueFrom, setCustomDueFrom] = useState<Date | undefined>();
  const [customDueTo, setCustomDueTo] = useState<Date | undefined>();
  const [onlyMine, setOnlyMine] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupByKey>("none");
  const [viewMode, setViewMode] = useState<"board" | "list">("board");
  const [exporting, setExporting] = useState(false);

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      await downloadWithAuth(
        `/tasks/export/csv?projectId=${projectId}`,
        `tasks-${Date.now()}.csv`,
      );
    } catch (e: any) {
      toast({ variant: "error", title: e?.message ?? "Export failed" });
    } finally {
      setExporting(false);
    }
  };

  const deleteTask = useDeleteTask();

  const statusMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      apiPatch(`/tasks/${id}`, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["project-tasks", projectId] });
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
  const labels = toArray<LabelRow>(labelsQuery.data);
  const sprints = toArray<SprintRow>(sprintsQuery.data);

  const filteredTasks = useMemo(() => {
    const term = searchText.trim().toLowerCase();
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);
    const startOfWeek = new Date(startOfToday);
    const dayOfWeek = (startOfWeek.getDay() + 6) % 7;
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
      if (labelFilter) {
        const hasLabel = (t.labels ?? []).some((l) => l.id === labelFilter);
        if (!hasLabel) return false;
      }
      if (sprintFilter) {
        if (sprintFilter === "__none__") {
          if (t.sprintId) return false;
        } else if (t.sprintId !== sprintFilter) {
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
    labelFilter, sprintFilter, dueFilter, customDueFrom, customDueTo,
  ]);

  // Sort each column / list by due date so the earliest-due tasks
  // appear at the top of the board. Tasks without a due date fall to
  // the bottom. Tiebreaker: priority (URGENT > HIGH > MEDIUM > LOW).
  const sortedTasks = useMemo(() => {
    const priorityRank: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return [...filteredTasks].sort((a, b) => {
      const ad = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
      const bd = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
      if (ad !== bd) return ad - bd;
      const ap = priorityRank[a.priority] ?? 99;
      const bp = priorityRank[b.priority] ?? 99;
      return ap - bp;
    });
  }, [filteredTasks]);

  const hasFilters =
    !!searchText || !!assigneeFilter || !!priorityFilter ||
    !!labelFilter || !!sprintFilter || !!dueFilter || onlyMine;

  const clearFilters = () => {
    setSearchText("");
    setAssigneeFilter("");
    setPriorityFilter("");
    setLabelFilter("");
    setSprintFilter("");
    setDueFilter("");
    setCustomDueFrom(undefined);
    setCustomDueTo(undefined);
    setOnlyMine(false);
  };

  if (query.isLoading) return <LoadingState label="Loading tasks..." />;
  if (query.isError || !query.data) return <ErrorState label="Unable to load project tasks." />;

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

    let newColumnKey: string | null = null;

    if (typeof over.id === "string" && over.id.startsWith("column-")) {
      newColumnKey = over.id.replace("column-", "");
    } else if (typeof over.id === "string" && over.id.startsWith("lane-")) {
      // Lane ids are "lane-<group>-col-<columnKey>" where columnKey may contain hyphens.
      const m = over.id.match(/^lane-(.+)-col-(.+)$/);
      if (m) newColumnKey = m[2];
    } else {
      const overTask = tasks.find((t) => t.id === over.id);
      if (overTask) {
        newColumnKey = hasCustom ? (overTask.customStatusId ?? null) : overTask.status;
      }
    }

    if (!newColumnKey) return;
    if (!columnKeys.has(newColumnKey)) return;

    const currentKey = hasCustom ? (task.customStatusId ?? null) : task.status;
    if (newColumnKey === currentKey) return;

    if (hasCustom) {
      const target = columns.find((c) => c.key === newColumnKey);
      const derivedStatus = target?.category ?? task.status;
      qc.setQueryData(["project-tasks", projectId], (old: unknown) => {
        const data = old as { data: Task[] } | undefined;
        if (!data?.data) return old;
        return {
          ...data,
          data: data.data.map((t) =>
            t.id === task.id
              ? { ...t, customStatusId: newColumnKey, status: derivedStatus }
              : t,
          ),
        };
      });
      statusMutation.mutate({ id: task.id, payload: { customStatusId: newColumnKey } });
    } else {
      qc.setQueryData(["project-tasks", projectId], (old: unknown) => {
        const data = old as { data: Task[] } | undefined;
        if (!data?.data) return old;
        return {
          ...data,
          data: data.data.map((t) => (t.id === task.id ? { ...t, status: newColumnKey! } : t)),
        };
      });
      statusMutation.mutate({ id: task.id, payload: { status: newColumnKey } });
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
  const totalStoryPoints = tasks.reduce(
    (sum, t) => sum + (typeof t.storyPoints === "number" ? t.storyPoints : 0),
    0,
  );

  const projectName = (projectQuery.data as { name?: string } | undefined)?.name ?? "";

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Space
          </span>
          <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {projectName}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Export is reporting-only — employees don't need it. */}
          {isAdmin && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleExportCsv}
              disabled={exporting}
            >
              <Download className="mr-1 size-3.5" /> {exporting ? "Exporting…" : "Export CSV"}
            </Button>
          )}
          <Button size="sm" onClick={() => openCreateForStatus(undefined)}>
            <Plus className="mr-1 size-4" /> New Task
          </Button>
        </div>
      </div>

      {/* Metrics strip */}
      <div className="flex flex-wrap items-center gap-x-1 gap-y-2 text-xs">
        {columns.map((col) => {
          const count = tasks.filter((t) =>
            hasCustom ? t.customStatusId === col.key : t.status === col.key,
          ).length;
          const dotClass = col.isCustom ? "" : (COLUMN_DOT_CLASS[col.key] ?? "bg-slate-400");
          const textClass = col.isCustom
            ? "text-slate-700 dark:text-slate-200"
            : (COLUMN_TEXT_CLASS[col.key] ?? "text-slate-600 dark:text-slate-300");
          return (
            <div key={col.key} className="flex items-center">
              <div className="flex items-center gap-2 px-2 py-1">
                <span
                  className={`size-2 rounded-full ${dotClass}`}
                  style={col.color ? { backgroundColor: col.color } : undefined}
                />
                <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {col.label}
                </span>
                <span className={`text-xs font-semibold ${textClass}`}>{count}</span>
              </div>
              <span className="h-4 w-px bg-slate-200 dark:bg-slate-700" aria-hidden />
            </div>
          );
        })}
        <div className="flex items-center gap-2 px-2 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-300">
          <span>{totalTasks} tasks</span>
          <span className="text-slate-300 dark:text-slate-600">·</span>
          <span>{totalStoryPoints} story pts</span>
        </div>
      </div>

      {/* Filter bar — single card, condensed */}
      <div className="space-y-2">
        {/* Row 1 — Search + select filters + view toggle + clear */}
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
          {sprints.length > 0 && (
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

      {/* Board or empty state */}
      {totalTasks === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white/50 px-6 py-16 text-center dark:border-slate-700 dark:bg-slate-900/30">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Kanban className="size-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              No tasks in {projectName || "this space"} yet
            </h3>
            <p className="text-sm text-slate-500">
              Get this Kanban space going by adding the first task.
            </p>
          </div>
          <Button onClick={() => openCreateForStatus(undefined)}>
            <Plus className="mr-1 size-4" /> Add first task
          </Button>
        </div>
      ) : viewMode === "list" ? (
        <TaskListView
          tasks={sortedTasks as any}
          onRowClick={(t) => setSelectedTaskId(t.id)}
          showProject={false}
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
              {columns.map((col) => (
                <KanbanColumn
                  key={col.key}
                  status={col.key}
                  labelOverride={col.isCustom ? col.label : undefined}
                  colorOverride={col.isCustom ? col.color : undefined}
                  tasks={sortedTasks.filter((t) =>
                    hasCustom ? t.customStatusId === col.key : t.status === col.key,
                  )}
                  onEditTask={(task) => setSelectedTaskId(task.id)}
                  onAddTask={(status) => openCreateForStatus(status)}
                  onDeleteTask={(task) => handleDeleteTask(task)}
                />
              ))}
            </div>
          ) : (
            <SwimLaneBoard
              groups={groupTasksBy(sortedTasks as any, groupBy)}
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

      <CreateTaskDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setCreateStatus(undefined);
        }}
        defaultProjectId={projectId}
        defaultStatus={createStatus}
      />

      <TaskDetailDrawer taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
    </div>
  );
}
