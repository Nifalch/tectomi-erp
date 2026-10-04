"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { DraggableTaskCard } from "./draggable-task-card";
import { cn } from "@/lib/utils";

const columnDot: Record<string, string> = {
  BACKLOG: "bg-slate-400",
  TODO: "bg-blue-500",
  IN_PROGRESS: "bg-amber-500",
  REVIEW: "bg-purple-500",
  DONE: "bg-emerald-500",
  BLOCKED: "bg-red-500",
};

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  description?: string;
  project: { name: string };
  assignedTo?: { firstName: string; lastName: string } | null;
  dueDate?: string;
  storyPoints?: number | null;
  labels?: Array<{ id: string; name: string; color?: string | null }>;
  _count?: { comments?: number; attachments?: number };
}

interface KanbanColumnProps {
  status: string;
  tasks: Task[];
  onEditTask: (task: Task) => void;
  onLogTime?: (task: Task) => void;
  onAddTask?: (status: string) => void;
  onDeleteTask?: (task: Task) => void;
  /** Optional label override (used for custom statuses). */
  labelOverride?: string;
  /** Optional hex color override (used for custom statuses). */
  colorOverride?: string;
}

export function KanbanColumn({
  status,
  tasks,
  onEditTask,
  onLogTime,
  onAddTask,
  onDeleteTask,
  labelOverride,
  colorOverride,
}: KanbanColumnProps) {
  const label = labelOverride ?? status.replaceAll("_", " ");
  const dotClass = colorOverride ? "" : (columnDot[status] ?? "bg-slate-400");

  const { setNodeRef, isOver } = useDroppable({
    id: `column-${status}`,
    data: { status },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-[280px] shrink-0 flex-col rounded-xl bg-slate-50/60 p-2 transition-colors dark:bg-slate-800/20",
        isOver && "bg-primary/5 ring-2 ring-dashed ring-primary/40",
      )}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 border-b border-slate-200/70 px-1 pb-2 dark:border-slate-700/60">
        <span
          className={cn("size-2 rounded-full", dotClass)}
          style={colorOverride ? { backgroundColor: colorOverride } : undefined}
        />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {label}
        </span>
        <span className="ml-1 inline-flex min-w-[22px] items-center justify-center rounded-full bg-slate-200/70 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-700/60 dark:text-slate-300">
          {tasks.length}
        </span>
        {onAddTask && (
          <button
            type="button"
            onClick={() => onAddTask(status)}
            className="ml-auto rounded-md p-1 text-slate-400 transition hover:bg-slate-200/60 hover:text-slate-700 dark:hover:bg-slate-700/60 dark:hover:text-slate-200"
            title={`Add task to ${label}`}
            aria-label={`Add task to ${label}`}
          >
            <Plus className="size-3.5" />
          </button>
        )}
      </div>

      {/* Column body */}
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div
          className="flex flex-1 flex-col gap-2 overflow-y-auto pt-2"
          style={{ maxHeight: "calc(100vh - 340px)", minHeight: 160 }}
        >
          {tasks.length === 0 ? (
            <div className="flex flex-1 items-center justify-center py-10 text-center text-xs italic text-slate-400/70">
              Drop a task here
            </div>
          ) : (
            tasks.map((task) => (
              <DraggableTaskCard
                key={task.id}
                task={task}
                onEdit={() => onEditTask(task)}
                onLogTime={onLogTime ? () => onLogTime(task) : undefined}
                onDelete={onDeleteTask ? () => onDeleteTask(task) : undefined}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  );
}
