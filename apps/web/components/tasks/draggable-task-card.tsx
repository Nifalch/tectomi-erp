"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Clock,
  GripVertical,
  MoreHorizontal,
  MessageSquare,
  Paperclip,
  Pencil,
  Trash2,
  UserPlus,
  ArrowRightLeft,
  Eye,
} from "lucide-react";
import { useTaskWatchers } from "@/lib/api/hooks";
import { useWatchTask, useUnwatchTask } from "@/lib/api/mutations";
import { useAuthStore } from "@/lib/store/auth-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { TaskTimerButton } from "./task-timer-button";

interface Task {
  id: string;
  title: string;
  priority: string;
  description?: string;
  status?: string;
  project: { name: string };
  assignedTo?: { firstName: string; lastName: string } | null;
  dueDate?: string;
  storyPoints?: number | null;
  labels?: Array<{ id: string; name: string; color?: string | null }>;
  _count?: { comments?: number; attachments?: number };
  commentCount?: number;
  attachmentCount?: number;
}

interface Props {
  task: Task;
  onEdit: () => void;
  onLogTime?: () => void;
  onDelete?: () => void;
  onChangeStatus?: () => void;
  onAssign?: () => void;
  overlay?: boolean;
}

const PRIORITY_STYLES: Record<string, string> = {
  URGENT: "bg-red-500/10 text-red-600 ring-1 ring-inset ring-red-500/20 dark:text-red-400",
  HIGH: "bg-amber-500/10 text-amber-700 ring-1 ring-inset ring-amber-500/20 dark:text-amber-400",
  MEDIUM: "bg-blue-500/10 text-blue-700 ring-1 ring-inset ring-blue-500/20 dark:text-blue-400",
  LOW: "bg-slate-500/10 text-slate-600 ring-1 ring-inset ring-slate-500/20 dark:text-slate-400",
};

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

function WatchQuickButton({ taskId }: { taskId: string }) {
  const watch = useWatchTask();
  const unwatch = useUnwatchTask();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const watchersQuery = useTaskWatchers(taskId);
  const watchers = Array.isArray(watchersQuery.data) ? watchersQuery.data : [];
  // Backend returns flat user rows — match by top-level id, not w.user.id.
  const isWatching = !!currentUserId && watchers.some((w: any) => w.id === currentUserId);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (isWatching) unwatch.mutate(taskId);
        else watch.mutate(taskId);
      }}
      className={cn(
        "rounded-md p-1 transition",
        isWatching
          ? "text-primary"
          : "text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800",
      )}
      title={isWatching ? "Unwatch" : "Watch"}
      aria-label={isWatching ? "Unwatch task" : "Watch task"}
    >
      <Eye className="size-3.5" />
    </button>
  );
}

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h << 5) - h + str.charCodeAt(i);
  return Math.abs(h);
}

function formatDue(dueDate: string): string {
  const d = new Date(dueDate);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "2-digit",
  });
}

export function DraggableTaskCard({
  task,
  onEdit,
  onLogTime,
  onDelete,
  onChangeStatus,
  onAssign,
  overlay = false,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { task },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging && !overlay ? 0.4 : 1,
  };

  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();
  const commentCount = task.commentCount ?? task._count?.comments ?? 0;
  const attachmentCount = task.attachmentCount ?? task._count?.attachments ?? 0;
  // Backend returns TaskLabel join rows: { labelId, label: { id, name, color } }.
  // Normalize to a flat { id, name, color } shape regardless of source.
  const labels = (task.labels ?? []).map((l: any) => {
    const src = l?.label ?? l;
    return {
      id: src?.id ?? l?.labelId ?? src?.name ?? Math.random().toString(36),
      name: src?.name ?? "",
      color: src?.color ?? null,
    };
  });
  const visibleLabels = labels.slice(0, 3);
  const extraLabels = labels.length - visibleLabels.length;
  const priorityClass = PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.MEDIUM;

  const assignee = task.assignedTo;
  const initials = assignee
    ? `${assignee.firstName?.[0] ?? ""}${assignee.lastName?.[0] ?? ""}`.toUpperCase()
    : "";
  const avatarColor = assignee
    ? AVATAR_COLORS[hashString(`${assignee.firstName}${assignee.lastName}`) % AVATAR_COLORS.length]
    : "bg-slate-400";
  const assigneeName = assignee ? `${assignee.firstName} ${assignee.lastName}` : "Unassigned";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative rounded-lg border border-slate-200 bg-white text-[13px] shadow-sm transition-all dark:border-slate-700 dark:bg-slate-900/80",
        !isDragging && !overlay && "hover:-translate-y-0.5 hover:shadow-md",
        isDragging && !overlay && "cursor-grabbing opacity-90 shadow-xl ring-2 ring-primary/50",
        overlay && "rotate-2 cursor-grabbing shadow-2xl ring-2 ring-primary/60",
      )}
    >
      {/* Drag handle — left edge strip, visible on hover */}
      <div
        {...attributes}
        {...listeners}
        className="absolute left-0 top-0 bottom-0 flex w-5 cursor-grab items-center justify-center rounded-l-lg text-slate-300 opacity-0 transition group-hover:opacity-100 hover:bg-slate-50 hover:text-slate-500 dark:hover:bg-slate-800"
        title="Drag to move"
        aria-label="Drag task"
      >
        <GripVertical className="size-3.5" />
      </div>

      {/* Hover actions menu */}
      {!overlay && (
        <div className="absolute right-1.5 top-1.5 z-10 flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
          <WatchQuickButton taskId={task.id} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                title="More actions"
              >
                <MoreHorizontal className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
              >
                <Pencil className="size-3.5" /> Edit
              </DropdownMenuItem>
              {onAssign && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onAssign();
                  }}
                >
                  <UserPlus className="size-3.5" /> Assign
                </DropdownMenuItem>
              )}
              {onChangeStatus && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onChangeStatus();
                  }}
                >
                  <ArrowRightLeft className="size-3.5" /> Change status
                </DropdownMenuItem>
              )}
              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    destructive
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete();
                    }}
                  >
                    <Trash2 className="size-3.5" /> Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Content — click opens detail */}
      <div onClick={overlay ? undefined : onEdit} className="cursor-pointer space-y-2 px-3 py-2.5 pl-4">
        {/* Label chips */}
        {visibleLabels.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {visibleLabels.map((l) => (
              <span
                key={l.id}
                className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: l.color ?? "#94a3b8" }}
                />
                {l.name}
              </span>
            ))}
            {extraLabels > 0 && (
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                +{extraLabels}
              </span>
            )}
          </div>
        )}

        {/* Title */}
        <div className="line-clamp-2 pr-14 text-sm font-medium leading-snug text-slate-900 dark:text-white">
          {task.title}
        </div>

        {/* Description preview */}
        {task.description && (
          <div className="line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
            {task.description}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 pt-0.5 text-xs">
          <div className="flex min-w-0 items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                priorityClass,
              )}
            >
              {task.priority}
            </span>
            {typeof task.storyPoints === "number" && (
              <span className="inline-flex items-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {task.storyPoints}
              </span>
            )}
            {task.dueDate && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                  isOverdue
                    ? "bg-red-500/10 text-red-600 dark:text-red-400"
                    : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
                )}
                title={isOverdue ? "Overdue" : "Due date"}
              >
                <Clock className="size-3" />
                {formatDue(task.dueDate)}
              </span>
            )}
            {!overlay && (
              <span onClick={(e) => e.stopPropagation()} className="inline-flex">
                <TaskTimerButton taskId={task.id} size="sm" />
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2 text-[11px] text-slate-400">
            {commentCount > 0 && (
              <span className="inline-flex items-center gap-0.5" title={`${commentCount} comments`}>
                <MessageSquare className="size-3" />
                {commentCount}
              </span>
            )}
            {attachmentCount > 0 && (
              <span className="inline-flex items-center gap-0.5" title={`${attachmentCount} attachments`}>
                <Paperclip className="size-3" />
                {attachmentCount}
              </span>
            )}
            <span
              className={cn(
                "flex size-7 items-center justify-center rounded-full text-[10px] font-bold text-white ring-2 ring-white dark:ring-slate-900",
                avatarColor,
              )}
              title={assigneeName}
            >
              {initials || "?"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
