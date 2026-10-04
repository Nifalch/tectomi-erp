"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { DraggableTaskCard } from "./draggable-task-card";
import { cn } from "@/lib/utils";

export interface GroupableTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  description?: string;
  projectId?: string;
  project: { name: string };
  assignedTo?: { firstName: string; lastName: string } | null;
  assignedToId?: string;
  dueDate?: string;
  storyPoints?: number | null;
  labels?: Array<{ id: string; name: string; color?: string | null }>;
  _count?: { comments?: number; attachments?: number };
}

export type GroupByKey = "none" | "assignee" | "priority" | "label";

export interface TaskGroup {
  key: string;
  label: string;
  color?: string | null;
  tasks: GroupableTask[];
}

export function groupTasksBy(tasks: GroupableTask[], key: GroupByKey): TaskGroup[] {
  if (key === "none") return [{ key: "all", label: "All", tasks }];

  if (key === "assignee") {
    const map = new Map<string, TaskGroup>();
    for (const t of tasks) {
      const gid = t.assignedToId ?? "__unassigned__";
      const label = t.assignedTo
        ? `${t.assignedTo.firstName} ${t.assignedTo.lastName}`
        : "Unassigned";
      const g = map.get(gid) ?? { key: gid, label, tasks: [] };
      g.tasks.push(t);
      map.set(gid, g);
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }

  if (key === "priority") {
    const order = ["URGENT", "HIGH", "MEDIUM", "LOW"];
    const map = new Map<string, TaskGroup>();
    for (const t of tasks) {
      const gid = t.priority || "MEDIUM";
      const g = map.get(gid) ?? { key: gid, label: gid, tasks: [] };
      g.tasks.push(t);
      map.set(gid, g);
    }
    return Array.from(map.values()).sort(
      (a, b) => order.indexOf(a.key) - order.indexOf(b.key),
    );
  }

  if (key === "label") {
    const map = new Map<string, TaskGroup>();
    for (const t of tasks) {
      const lbls = t.labels ?? [];
      if (lbls.length === 0) {
        const g = map.get("__none__") ?? { key: "__none__", label: "No label", tasks: [] };
        g.tasks.push(t);
        map.set("__none__", g);
      } else {
        for (const l of lbls) {
          const g = map.get(l.id) ?? { key: l.id, label: l.name, color: l.color, tasks: [] };
          g.tasks.push(t);
          map.set(l.id, g);
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }

  return [{ key: "all", label: "All", tasks }];
}

const COLUMN_DOT: Record<string, string> = {
  BACKLOG: "bg-slate-400",
  TODO: "bg-blue-500",
  IN_PROGRESS: "bg-amber-500",
  REVIEW: "bg-purple-500",
  DONE: "bg-emerald-500",
  BLOCKED: "bg-red-500",
};

function LaneColumn({
  status,
  laneKey,
  tasks,
  onEditTask,
  onAddTask,
  onDeleteTask,
}: {
  status: string;
  laneKey: string;
  tasks: GroupableTask[];
  onEditTask: (t: GroupableTask) => void;
  onAddTask?: (status: string) => void;
  onDeleteTask?: (t: GroupableTask) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `lane-${laneKey}-col-${status}`,
    data: { status, laneKey },
  });
  const label = status.replaceAll("_", " ");
  const dot = COLUMN_DOT[status] ?? "bg-slate-400";

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-[260px] shrink-0 flex-col rounded-lg bg-slate-50/60 p-2 transition-colors dark:bg-slate-800/20",
        isOver && "bg-primary/5 ring-2 ring-dashed ring-primary/40",
      )}
    >
      <div className="flex items-center gap-2 border-b border-slate-200/70 px-1 pb-1.5 dark:border-slate-700/60">
        <span className={cn("size-2 rounded-full", dot)} />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {label}
        </span>
        <span className="ml-1 inline-flex min-w-[20px] items-center justify-center rounded-full bg-slate-200/70 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-700/60 dark:text-slate-300">
          {tasks.length}
        </span>
        {onAddTask && (
          <button
            type="button"
            onClick={() => onAddTask(status)}
            className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 dark:hover:bg-slate-700/60"
            aria-label={`Add task to ${label}`}
          >
            <Plus className="size-3" />
          </button>
        )}
      </div>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-1 flex-col gap-1.5 pt-2" style={{ minHeight: 80 }}>
          {tasks.length === 0 ? (
            <div className="py-4 text-center text-[10px] italic text-slate-400/70">Drop here</div>
          ) : (
            tasks.map((task) => (
              <DraggableTaskCard
                key={task.id}
                task={task}
                onEdit={() => onEditTask(task)}
                onDelete={onDeleteTask ? () => onDeleteTask(task) : undefined}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  );
}

const STATUSES = ["BACKLOG", "TODO", "IN_PROGRESS", "REVIEW", "DONE", "BLOCKED"] as const;

export function SwimLaneBoard({
  groups,
  onEditTask,
  onAddTask,
  onDeleteTask,
}: {
  groups: TaskGroup[];
  onEditTask: (t: GroupableTask) => void;
  onAddTask?: (status: string) => void;
  onDeleteTask?: (t: GroupableTask) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <SwimLane
          key={group.key}
          group={group}
          onEditTask={onEditTask}
          onAddTask={onAddTask}
          onDeleteTask={onDeleteTask}
        />
      ))}
    </div>
  );
}

function SwimLane({
  group,
  onEditTask,
  onAddTask,
  onDeleteTask,
}: {
  group: TaskGroup;
  onEditTask: (t: GroupableTask) => void;
  onAddTask?: (status: string) => void;
  onDeleteTask?: (t: GroupableTask) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="rounded-xl border border-border/60 bg-white/50 p-2 dark:bg-slate-900/40">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center gap-2 px-1 py-1 text-left"
      >
        {collapsed ? (
          <ChevronRight className="size-4 text-slate-400" />
        ) : (
          <ChevronDown className="size-4 text-slate-400" />
        )}
        {group.color ? (
          <span
            className="inline-block size-3 rounded-full"
            style={{ backgroundColor: group.color }}
          />
        ) : (
          <span className="inline-flex size-6 items-center justify-center rounded-full bg-indigo-500 text-[10px] font-bold text-white">
            {group.label.slice(0, 2).toUpperCase()}
          </span>
        )}
        <span className="font-semibold text-slate-700 dark:text-slate-200">{group.label}</span>
        <span className="inline-flex min-w-[22px] items-center justify-center rounded-full bg-slate-200/70 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-700/60 dark:text-slate-300">
          {group.tasks.length}
        </span>
      </button>
      {!collapsed && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-2">
          {STATUSES.map((s) => (
            <LaneColumn
              key={s}
              status={s}
              laneKey={group.key}
              tasks={group.tasks.filter((t) => t.status === s)}
              onEditTask={onEditTask}
              onAddTask={onAddTask}
              onDeleteTask={onDeleteTask}
            />
          ))}
        </div>
      )}
    </div>
  );
}
