"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type GoalCardType = "KPI" | "OKR" | "GOAL";
export type GoalCardStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface GoalCardData {
  id: string;
  title: string;
  type: GoalCardType;
  status: GoalCardStatus;
  targetValue: number;
  currentValue: number;
  unit?: string;
  dueDate?: string;
  assignee?: { firstName: string; lastName: string };
}

interface GoalCardProps {
  goal: GoalCardData;
  canMutate: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

const statusStyles: Record<GoalCardStatus, { label: string; className: string }> = {
  NOT_STARTED: { label: "Not started", className: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200" },
  IN_PROGRESS: { label: "In progress", className: "bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-200" },
  COMPLETED: { label: "Completed", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200" },
  CANCELLED: { label: "Cancelled", className: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" },
};

const typeDotColor: Record<GoalCardType, string> = {
  KPI: "bg-orange-500",
  OKR: "bg-sky-600",
  GOAL: "bg-emerald-600",
};

function formatUnit(current: number, target: number, unit?: string) {
  const u = unit ? ` ${unit}` : "";
  return `${current} / ${target}${u}`;
}

function initial(name?: { firstName: string; lastName: string }) {
  return name?.firstName?.[0]?.toUpperCase() ?? "?";
}

function assigneeName(name?: { firstName: string; lastName: string }) {
  if (!name) return "Unassigned";
  return `${name.firstName} ${name.lastName}`.trim();
}

function formatDueDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

export function GoalCard({ goal, canMutate, onEdit, onDelete }: GoalCardProps) {
  const pct = goal.targetValue > 0
    ? Math.min(100, Math.round((goal.currentValue / goal.targetValue) * 100))
    : 0;
  const typeClass = goal.type.toLowerCase() as "kpi" | "okr" | "goal";
  const status = statusStyles[goal.status];

  const handleCardClick = () => {
    if (canMutate) onEdit();
  };

  const handleCardKey = (e: React.KeyboardEvent) => {
    if (!canMutate) return;
    // Only handle key presses on the card itself, not bubbled from children
    // (e.g. Space / Enter on a dropdown menu item should not trigger edit).
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onEdit();
    }
  };

  return (
    <div
      role={canMutate ? "button" : "article"}
      tabIndex={canMutate ? 0 : undefined}
      onClick={canMutate ? handleCardClick : undefined}
      onKeyDown={canMutate ? handleCardKey : undefined}
      aria-label={canMutate ? `Edit ${goal.title}` : `${goal.title} – ${status.label}`}
      className={`glass-card p-5 flex flex-col gap-3 ${canMutate ? "is-clickable" : ""}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${typeDotColor[goal.type]}`} />
          <span className="text-[10px] font-semibold tracking-[0.12em] text-slate-500 dark:text-slate-400">
            {goal.type}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${status.className}`}>
            {status.label}
          </span>
          {canMutate && (
            <DropdownMenu>
              <DropdownMenuTrigger
                onClick={(e) => e.stopPropagation()}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Open actions"
              >
                <MoreHorizontal className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={(e) => { e.stopPropagation(); onEdit(); }}
                >
                  <Pencil className="size-4" /> Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  destructive
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                >
                  <Trash2 className="size-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <h3 className="text-[15px] font-semibold leading-snug text-slate-900 dark:text-slate-100">
        {goal.title}
      </h3>

      <div>
        <div className="flex items-baseline gap-1">
          <span className="text-[34px] font-extrabold leading-none text-slate-900 dark:text-slate-100 tracking-tight">
            {pct}
          </span>
          <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">%</span>
        </div>
        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {formatUnit(goal.currentValue, goal.targetValue, goal.unit)}
        </div>
      </div>

      <div className="progress-rail">
        <div className={`progress-fill ${typeClass}`} style={{ width: `${pct}%` }} />
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1">
        <span className="flex items-center gap-2">
          <span className="assignee-avatar">{initial(goal.assignee)}</span>
          <span>{assigneeName(goal.assignee)}</span>
        </span>
        <span>{formatDueDate(goal.dueDate)}</span>
      </div>
    </div>
  );
}
