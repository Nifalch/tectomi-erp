"use client";

import { StatusBadge } from "@/components/ui/status-badge";
import { Clock, Pencil } from "lucide-react";

interface TaskCardProps {
  task: {
    id: string;
    title: string;
    priority: string;
    project: { name: string };
    assignedTo?: { firstName: string; lastName: string } | null;
    dueDate?: string;
  };
  onEdit: () => void;
  onLogTime?: () => void;
}

export function TaskCard({ task, onEdit, onLogTime }: TaskCardProps) {
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();

  return (
    <div
      className="group cursor-pointer rounded-xl border border-border/70 bg-white p-3.5 text-sm shadow-sm transition hover:shadow-md dark:bg-slate-900/80"
      onClick={onEdit}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 font-medium leading-snug">{task.title}</div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            onClick={(e) => { e.stopPropagation(); onLogTime?.(); }}
            className="shrink-0 rounded-lg p-1 text-slate-400 opacity-0 transition group-hover:opacity-100 hover:bg-slate-100 hover:text-slate-600"
            title="Log time"
          >
            <Clock className="size-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="shrink-0 rounded-lg p-1 text-slate-400 opacity-0 transition group-hover:opacity-100 hover:bg-slate-100 hover:text-slate-600"
            title="Edit task"
          >
            <Pencil className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-2 text-xs text-slate-500">{task.project.name}</div>

      <div className="mt-3 flex items-center justify-between">
        <StatusBadge status={task.priority} size="sm" />
        <div className="flex items-center gap-2">
          {task.dueDate && (
            <span className={`text-[10px] ${isOverdue ? "font-semibold text-red-500" : "text-slate-400"}`}>
              {new Date(task.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          )}
          {task.assignedTo && (
            <span className="flex size-6 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {task.assignedTo.firstName[0]}{task.assignedTo.lastName[0]}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
