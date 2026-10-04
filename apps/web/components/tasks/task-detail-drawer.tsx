"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { formatDistanceToNow, format, isBefore, startOfDay } from "date-fns";
import { Drawer } from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { NumberInput } from "@/components/ui/number-input";
import { DatePicker } from "@/components/ui/date-picker";
import * as Popover from "@radix-ui/react-popover";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiPost, apiDelete } from "@/lib/api/client";
import {
  useUpdateTask,
  useDeleteTask,
  useAddTaskComment,
  useAddTaskLabel,
  useRemoveTaskLabel,
  useCreateLabel,
  useAddTaskDependency,
} from "@/lib/api/mutations";
import {
  useUsers,
  useLabels,
  useProjectStatuses,
  useActiveTimer,
  useTaskTimeSummary,
  useSprints,
  useProject,
  useMentionableUsers,
  useTaskEstimateVsActual,
  useTaskWatchers,
  useTaskHistory,
  useProjectMilestones,
} from "@/lib/api/hooks";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { useWatchTask, useUnwatchTask } from "@/lib/api/mutations";
import { useDeleteTimeEntry } from "@/lib/api/mutations";
import { useAuthStore } from "@/lib/store/auth-store";
import { toArray, cn, staffOnly } from "@/lib/utils";
import {
  Trash2,
  Send,
  MessageSquare,
  Tag,
  Plus,
  X,
  Paperclip,
  Download,
  FileText,
  Clock,
  ChevronDown,
  ChevronRight,
  Circle,
  Flag,
  User,
  Rocket,
  Calendar,
  Hash,
  CheckSquare,
  Square,
  Link2,
  Timer,
  Pencil,
  Eye,
  EyeOff,
  Target,
  Link as LinkIcon,
  List as ListIcon,
  ListOrdered as ListOrderedIcon,
  Quote as QuoteIcon,
} from "lucide-react";
import { TaskTimerButton } from "./task-timer-button";

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function formatDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function initialsOf(first?: string, last?: string) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}

// --------------------------------------------------------------------------
// Status / Priority colour tables
// --------------------------------------------------------------------------

type StatusKey = "BACKLOG" | "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE" | "BLOCKED";

const STATUS_META: Record<
  StatusKey,
  { label: string; dot: string; text: string; bg: string }
> = {
  BACKLOG: {
    label: "Backlog",
    dot: "bg-slate-400",
    text: "text-slate-600 dark:text-slate-300",
    bg: "bg-slate-500/10",
  },
  TODO: {
    label: "To do",
    dot: "bg-cyan-500",
    text: "text-cyan-700 dark:text-cyan-300",
    bg: "bg-cyan-500/10",
  },
  IN_PROGRESS: {
    label: "In progress",
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-300",
    bg: "bg-amber-500/10",
  },
  REVIEW: {
    label: "Review",
    dot: "bg-purple-500",
    text: "text-purple-700 dark:text-purple-300",
    bg: "bg-purple-500/10",
  },
  DONE: {
    label: "Done",
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-300",
    bg: "bg-emerald-500/10",
  },
  BLOCKED: {
    label: "Blocked",
    dot: "bg-red-500",
    text: "text-red-700 dark:text-red-300",
    bg: "bg-red-500/10",
  },
};

const STATUS_ORDER: StatusKey[] = [
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "REVIEW",
  "DONE",
  "BLOCKED",
];

type PriorityKey = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

const PRIORITY_META: Record<
  PriorityKey,
  { label: string; text: string; bg: string; flag: string }
> = {
  LOW: {
    label: "Low",
    text: "text-slate-600 dark:text-slate-300",
    bg: "bg-slate-500/10",
    flag: "text-slate-400",
  },
  MEDIUM: {
    label: "Medium",
    text: "text-blue-700 dark:text-blue-300",
    bg: "bg-blue-500/10",
    flag: "text-blue-500",
  },
  HIGH: {
    label: "High",
    text: "text-amber-700 dark:text-amber-300",
    bg: "bg-amber-500/12",
    flag: "text-amber-500",
  },
  URGENT: {
    label: "Urgent",
    text: "text-red-700 dark:text-red-300",
    bg: "bg-red-500/12",
    flag: "text-red-500",
  },
};

const PRIORITY_ORDER: PriorityKey[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

interface TimeEntryRow {
  id: string;
  startTime: string;
  endTime?: string | null;
  duration?: number | null;
  notes?: string | null;
  user?: { id?: string; firstName?: string; lastName?: string } | null;
  userId?: string;
}

interface TaskTimeSummary {
  totalMinutes: number;
  activeCount: number;
  entries: TimeEntryRow[];
  byUser: Array<{
    user?: { id?: string; firstName?: string; lastName?: string } | null;
    userId?: string;
    minutes: number;
    count: number;
  }>;
}

interface Props {
  taskId: string | null;
  onClose: () => void;
}

// Mention marker format: @[userId|First Last]
function renderCommentContent(content: string) {
  const parts: Array<string | { userId: string; name: string; key: number }> = [];
  let last = 0;
  let i = 0;
  const re = /@\[([^|\]]+)\|([^\]]+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) parts.push(content.slice(last, m.index));
    parts.push({ userId: m[1], name: m[2], key: i++ });
    last = m.index + m[0].length;
  }
  if (last < content.length) parts.push(content.slice(last));
  return parts.map((p, idx) =>
    typeof p === "string" ? (
      <span key={idx}>{p}</span>
    ) : (
      <span
        key={`${p.key}-${idx}`}
        className="mx-0.5 inline-flex items-center rounded-md bg-primary/15 px-1.5 py-0.5 text-xs font-medium text-primary"
      >
        @{p.name}
      </span>
    ),
  );
}

interface MentionUser { id: string; firstName: string; lastName: string; email?: string }

interface CommentComposerProps {
  taskId: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
}

function CommentComposer({ taskId, value, onChange, onSubmit, submitting }: CommentComposerProps) {
  const mentionablesQuery = useMentionableUsers(taskId);
  const users = toArray<MentionUser>(mentionablesQuery.data);
  const [showSuggest, setShowSuggest] = useState(false);
  const [query, setQuery] = useState("");
  const [mentionStart, setMentionStart] = useState<number>(-1);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const detectMention = (text: string, caret: number) => {
    let i = caret - 1;
    while (i >= 0) {
      const ch = text[i];
      if (ch === "@") {
        const prev = i > 0 ? text[i - 1] : " ";
        if (/\s/.test(prev) || i === 0) {
          const q = text.slice(i + 1, caret);
          if (/^[A-Za-z]*$/.test(q)) {
            setMentionStart(i);
            setQuery(q);
            setShowSuggest(true);
            return;
          }
        }
        break;
      }
      if (/\s/.test(ch)) break;
      i--;
    }
    setShowSuggest(false);
    setMentionStart(-1);
    setQuery("");
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    onChange(text);
    detectMention(text, e.target.selectionStart ?? text.length);
  };

  const handleSelectUser = (u: MentionUser) => {
    if (mentionStart < 0) return;
    const before = value.slice(0, mentionStart);
    const after = value.slice(taRef.current?.selectionStart ?? value.length);
    const token = "@[" + u.id + "|" + u.firstName + " " + u.lastName + "] ";
    const next = before + token + after;
    onChange(next);
    setShowSuggest(false);
    setMentionStart(-1);
    setQuery("");
    setTimeout(() => taRef.current?.focus(), 0);
  };

  const filtered = users.filter((u) => {
    if (!query) return true;
    const name = (u.firstName + " " + u.lastName).toLowerCase();
    return name.startsWith(query.toLowerCase()) || u.firstName.toLowerCase().startsWith(query.toLowerCase());
  }).slice(0, 8);

  return (
    <div className="flex flex-1 flex-col gap-2">
      <div className="relative">
        <TextArea
          ref={taRef}
          value={value}
          onChange={handleChange}
          placeholder="Write a comment… use @ to mention"
          className="min-h-[60px]"
        />
        {showSuggest && filtered.length > 0 && (
          <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-border bg-white shadow-lg dark:bg-slate-900">
            {filtered.map((u) => (
              <button
                key={u.id}
                type="button"
                onMouseDown={(ev) => { ev.preventDefault(); handleSelectUser(u); }}
                className="block w-full truncate px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {u.firstName} {u.lastName}
                {u.email && <span className="ml-1 text-[10px] text-slate-400">{u.email}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={onSubmit}
          disabled={submitting || !value.trim()}
        >
          <Send className="mr-1 size-3.5" /> Comment
        </Button>
      </div>
    </div>
  );
}

interface LabelRef {
  id: string;
  name: string;
  color: string;
  projectId?: string;
}

interface TaskLabel {
  label: LabelRef;
}

interface TaskRef {
  id: string;
  title?: string;
  status?: string;
}

interface Dependency {
  id: string;
  blocking?: TaskRef;
  blockingId?: string;
  title?: string;
  status?: string;
}

interface Subtask {
  id: string;
  title: string;
  status: string;
}

interface Attachment {
  id: string;
  filename?: string;
  originalName?: string;
  fileSize?: number;
  url?: string;
  uploadedBy?: { firstName?: string; lastName?: string };
}

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  author?: { firstName?: string; lastName?: string };
}

interface Task {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  assignedToId?: string | null;
  storyPoints?: number | null;
  dueDate?: string | null;
  startDate?: string | null;
  milestoneId?: string | null;
  milestone?: { id: string; title: string; status?: string } | null;
  updatedAt?: string;
  labels?: TaskLabel[];
  dependencies?: Dependency[];
  blockedBy?: Dependency[];
  subtasks?: Subtask[];
  attachments?: Attachment[];
  comments?: Comment[];
  customStatusId?: string | null;
  isClientVisible?: boolean;
  customStatus?: {
    id: string;
    name: string;
    color: string;
    category: "TODO" | "IN_PROGRESS" | "DONE";
    sortOrder?: number;
  } | null;
  rollup?: {
    estimatedHrs: number | null;
    progressPercent: number | null;
    childCount: number;
  };
}

// --------------------------------------------------------------------------
// Small reusable sub-components
// --------------------------------------------------------------------------

function PropertyRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <div className="flex w-[84px] shrink-0 items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">
        <span className="flex size-3.5 shrink-0 items-center justify-center">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      {/* overflow-hidden so long chip values (Sprint names, milestones)
          truncate inside the sidebar instead of expanding the column and
          pushing the main content off to the left. */}
      <div className="flex min-w-0 flex-1 items-center overflow-hidden">{children}</div>
    </div>
  );
}

function Chip({
  onClick,
  className,
  children,
  muted,
  as = "button",
}: {
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
  muted?: boolean;
  as?: "button" | "div";
}) {
  const Comp: any = as;
  return (
    <Comp
      type={as === "button" ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium transition-colors",
        "hover:bg-slate-100 dark:hover:bg-slate-800",
        muted && "text-slate-400",
        className,
      )}
    >
      {children}
    </Comp>
  );
}

interface CustomStatusOption {
  id: string;
  name: string;
  color: string;
  category?: "TODO" | "IN_PROGRESS" | "DONE";
  sortOrder?: number;
}

function StatusChip({
  value,
  onChange,
  customStatuses,
  customStatusId,
  onChangeCustom,
}: {
  value: string;
  onChange: (v: string) => void;
  customStatuses?: CustomStatusOption[];
  customStatusId?: string | null;
  onChangeCustom?: (id: string) => void;
}) {
  const hasCustom = !!customStatuses && customStatuses.length > 0;

  if (hasCustom) {
    const active = customStatuses!.find((s) => s.id === customStatusId) ?? null;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
              "hover:brightness-95 dark:hover:brightness-110",
            )}
            style={
              active
                ? { backgroundColor: `${active.color}1f`, color: active.color }
                : undefined
            }
          >
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: active?.color ?? "#94a3b8" }}
            />
            {active?.name ?? "Set status"}
            <ChevronDown className="size-3 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          {customStatuses!.map((s) => (
            <DropdownMenuItem
              key={s.id}
              onSelect={(e) => {
                e.preventDefault();
                onChangeCustom?.(s.id);
              }}
            >
              <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="flex-1 truncate">{s.name}</span>
              {s.id === customStatusId && <span className="text-xs text-primary">✓</span>}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const key = (STATUS_ORDER.includes(value as StatusKey) ? value : "BACKLOG") as StatusKey;
  const meta = STATUS_META[key];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
            meta.bg,
            meta.text,
            "hover:brightness-95 dark:hover:brightness-110",
          )}
        >
          <span className={cn("size-2 rounded-full", meta.dot)} />
          {meta.label}
          <ChevronDown className="size-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {STATUS_ORDER.map((s) => (
          <DropdownMenuItem
            key={s}
            onSelect={(e) => {
              e.preventDefault();
              onChange(s);
            }}
          >
            <span className={cn("size-2 rounded-full", STATUS_META[s].dot)} />
            <span className="flex-1">{STATUS_META[s].label}</span>
            {s === key && <span className="text-xs text-primary">✓</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PriorityChip({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const key = (PRIORITY_ORDER.includes(value as PriorityKey) ? value : "MEDIUM") as PriorityKey;
  const meta = PRIORITY_META[key];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
            meta.bg,
            meta.text,
            "hover:brightness-95 dark:hover:brightness-110",
          )}
        >
          <Flag className={cn("size-3", meta.flag)} />
          {meta.label}
          <ChevronDown className="size-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40">
        {PRIORITY_ORDER.map((p) => (
          <DropdownMenuItem
            key={p}
            onSelect={(e) => {
              e.preventDefault();
              onChange(p);
            }}
          >
            <Flag className={cn("size-3", PRIORITY_META[p].flag)} />
            <span className="flex-1">{PRIORITY_META[p].label}</span>
            {p === key && <span className="text-xs text-primary">✓</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AssigneeChip({
  value,
  users,
  onChange,
}: {
  value: string | null | undefined;
  users: Array<{ id: string; firstName: string; lastName: string }>;
  onChange: (v: string | null) => void;
}) {
  const current = users.find((u) => u.id === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {current ? (
            <>
              <span className="inline-flex size-5 items-center justify-center rounded-full bg-indigo-500 text-[9px] font-bold text-white">
                {initialsOf(current.firstName, current.lastName)}
              </span>
              <span className="truncate">
                {current.firstName} {current.lastName}
              </span>
            </>
          ) : (
            <>
              <span className="inline-flex size-5 items-center justify-center rounded-full border border-dashed border-slate-300 text-slate-400 dark:border-slate-600">
                <User className="size-3" />
              </span>
              <span className="text-slate-400">Unassigned</span>
            </>
          )}
          <ChevronDown className="size-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-y-auto">
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            onChange(null);
          }}
        >
          <span className="inline-flex size-5 items-center justify-center rounded-full border border-dashed border-slate-300 text-slate-400 dark:border-slate-600">
            <User className="size-3" />
          </span>
          <span className="flex-1 text-slate-400">Unassigned</span>
          {!current && <span className="text-xs text-primary">✓</span>}
        </DropdownMenuItem>
        {users.map((u) => (
          <DropdownMenuItem
            key={u.id}
            onSelect={(e) => {
              e.preventDefault();
              onChange(u.id);
            }}
          >
            <span className="inline-flex size-5 items-center justify-center rounded-full bg-indigo-500 text-[9px] font-bold text-white">
              {initialsOf(u.firstName, u.lastName)}
            </span>
            <span className="flex-1 truncate">
              {u.firstName} {u.lastName}
            </span>
            {u.id === value && <span className="text-xs text-primary">✓</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SprintChip({
  value,
  sprints,
  onChange,
}: {
  value: string | null | undefined;
  sprints: Array<{ id: string; name: string; status: string }>;
  onChange: (v: string | null) => void;
}) {
  const current = sprints.find((s) => s.id === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {current ? (
            <>
              <Rocket className="size-3 text-indigo-500" />
              <span className="truncate">{current.name}</span>
              {current.status === "ACTIVE" && (
                <span className="rounded-sm bg-emerald-500/15 px-1 text-[9px] font-semibold uppercase text-emerald-600">
                  Active
                </span>
              )}
            </>
          ) : (
            <>
              <Rocket className="size-3 text-slate-400" />
              <span className="italic text-slate-400">Backlog</span>
            </>
          )}
          <ChevronDown className="size-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-y-auto">
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            onChange(null);
          }}
        >
          <Rocket className="size-3 text-slate-400" />
          <span className="flex-1 italic text-slate-400">Backlog (no sprint)</span>
          {!current && <span className="text-xs text-primary">✓</span>}
        </DropdownMenuItem>
        {sprints.map((s) => (
          <DropdownMenuItem
            key={s.id}
            onSelect={(e) => {
              e.preventDefault();
              onChange(s.id);
            }}
          >
            <Rocket className="size-3 text-indigo-500" />
            <span className="flex-1 truncate">{s.name}</span>
            {s.status === "ACTIVE" && (
              <span className="text-[9px] font-semibold uppercase text-emerald-600">Active</span>
            )}
            {s.id === value && <span className="text-xs text-primary">✓</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DueDateChip({
  value,
  onChange,
}: {
  value: string | null | undefined;
  onChange: (d: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const d = value ? new Date(value) : null;
  const overdue = d ? isBefore(d, startOfDay(new Date())) : false;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div className="inline-flex items-center">
        <Popover.Trigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-slate-100 dark:hover:bg-slate-800",
              d && overdue
                ? "text-red-600 dark:text-red-400"
                : d
                  ? "text-slate-700 dark:text-slate-200"
                  : "text-slate-400",
            )}
          >
            <Calendar className="size-3 shrink-0" />
            <span className="truncate">{d ? format(d, "MMM d, yyyy") : "No due date"}</span>
          </button>
        </Popover.Trigger>
        {d && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="ml-0.5 rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700"
            aria-label="Clear due date"
          >
            <X className="size-3" />
          </button>
        )}
      </div>
      <Popover.Portal>
        <Popover.Content
          className="z-50 rounded-xl border border-border bg-white p-3 shadow-panel dark:bg-slate-900 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          sideOffset={6}
          align="end"
          collisionPadding={12}
        >
          <DayPicker
            mode="single"
            selected={d ?? undefined}
            onSelect={(day) => {
              onChange(day ? day.toISOString() : null);
              setOpen(false);
            }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function StartDateChip({
  value,
  onChange,
}: {
  value: string | null | undefined;
  onChange: (d: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const d = value ? new Date(value) : null;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div className="inline-flex items-center">
        <Popover.Trigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-slate-100 dark:hover:bg-slate-800",
              d ? "text-slate-700 dark:text-slate-200" : "text-slate-400",
            )}
          >
            <Calendar className="size-3 shrink-0" />
            <span className="truncate">{d ? format(d, "MMM d, yyyy") : "No start date"}</span>
          </button>
        </Popover.Trigger>
        {d && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="ml-0.5 rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700"
            aria-label="Clear start date"
          >
            <X className="size-3" />
          </button>
        )}
      </div>
      <Popover.Portal>
        <Popover.Content
          className="z-50 rounded-xl border border-border bg-white p-3 shadow-panel dark:bg-slate-900 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          sideOffset={6}
          align="end"
          collisionPadding={12}
        >
          <DayPicker
            mode="single"
            selected={d ?? undefined}
            onSelect={(day) => {
              onChange(day ? day.toISOString() : null);
              setOpen(false);
            }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function MilestoneChip({
  value,
  milestones,
  onChange,
}: {
  value: string | null | undefined;
  milestones: Array<{ id: string; title: string; status?: string }>;
  onChange: (v: string | null) => void;
}) {
  const current = milestones.find((m) => m.id === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-slate-100 dark:hover:bg-slate-800",
            current ? "text-slate-700 dark:text-slate-200" : "text-slate-400",
          )}
        >
          <Target className={cn("size-3 shrink-0", current ? "text-indigo-500" : "text-slate-400")} />
          <span className="truncate">{current ? current.title : "No milestone"}</span>
          <ChevronDown className="size-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-60 overflow-y-auto">
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            onChange(null);
          }}
        >
          <Target className="size-3 text-slate-400" />
          <span className="flex-1 italic text-slate-400">Unlink (no milestone)</span>
          {!current && <span className="text-xs text-primary">✓</span>}
        </DropdownMenuItem>
        {milestones.length === 0 && (
          <div className="px-3 py-2 text-xs text-slate-400">No milestones on this project</div>
        )}
        {milestones.map((m) => (
          <DropdownMenuItem
            key={m.id}
            onSelect={(e) => {
              e.preventDefault();
              onChange(m.id);
            }}
          >
            <Target className="size-3 text-indigo-500" />
            <span className="flex-1 truncate">{m.title}</span>
            {m.status && m.status !== "NOT_STARTED" && (
              <span className="text-[9px] font-semibold uppercase text-slate-400">{m.status}</span>
            )}
            {m.id === value && <span className="text-xs text-primary">✓</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function InlineTitle({
  value,
  onSave,
}: {
  value: string;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onSave(trimmed);
    else setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className="w-full rounded-md border border-primary/40 bg-white px-2 py-1 text-xl font-semibold leading-tight tracking-tight text-slate-950 outline-none ring-2 ring-primary/20 dark:bg-slate-950 dark:text-white"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group flex w-full items-start rounded-md px-2 py-1 text-left text-xl font-semibold leading-tight tracking-tight text-slate-950 transition-colors hover:bg-slate-100 dark:text-white dark:hover:bg-slate-800"
    >
      <span className="flex-1 break-words">{value || "Untitled task"}</span>
      <Pencil className="mt-1 size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-50" />
    </button>
  );
}

// Render a lightweight subset of markdown:
//   **bold**, *italic*, `code`, lines starting with `- ` as bullet items,
//   lines starting with `> ` as block quotes. Otherwise preserve line breaks.
function renderMarkdownLite(text: string) {
  const lines = text.split(/\n/);
  const blocks: React.ReactNode[] = [];
  let listBuf: string[] = [];
  const flushList = (keyPrefix: string) => {
    if (listBuf.length) {
      blocks.push(
        <ul key={`list-${keyPrefix}`} className="ml-5 list-disc space-y-0.5">
          {listBuf.map((l, i) => (
            <li key={i}>{inlineFormat(l)}</li>
          ))}
        </ul>,
      );
      listBuf = [];
    }
  };
  const inlineFormat = (s: string): React.ReactNode => {
    // Split into segments by **bold**, *italic*, `code`
    const parts: React.ReactNode[] = [];
    const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let k = 0;
    while ((match = regex.exec(s)) !== null) {
      if (match.index > lastIndex) parts.push(s.slice(lastIndex, match.index));
      const seg = match[0];
      if (seg.startsWith("**")) {
        parts.push(<strong key={k++}>{seg.slice(2, -2)}</strong>);
      } else if (seg.startsWith("`")) {
        parts.push(
          <code
            key={k++}
            className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em] dark:bg-slate-800"
          >
            {seg.slice(1, -1)}
          </code>,
        );
      } else {
        parts.push(<em key={k++}>{seg.slice(1, -1)}</em>);
      }
      lastIndex = match.index + seg.length;
    }
    if (lastIndex < s.length) parts.push(s.slice(lastIndex));
    return parts;
  };

  lines.forEach((line, idx) => {
    if (/^\s*-\s+/.test(line)) {
      listBuf.push(line.replace(/^\s*-\s+/, ""));
    } else if (/^\s*>\s+/.test(line)) {
      flushList(`${idx}`);
      blocks.push(
        <blockquote
          key={`bq-${idx}`}
          className="border-l-2 border-slate-300 pl-3 italic text-slate-600 dark:border-slate-600 dark:text-slate-400"
        >
          {inlineFormat(line.replace(/^\s*>\s+/, ""))}
        </blockquote>,
      );
    } else {
      flushList(`${idx}`);
      if (line.trim() === "") blocks.push(<div key={`br-${idx}`} className="h-2" />);
      else blocks.push(<p key={`p-${idx}`}>{inlineFormat(line)}</p>);
    }
  });
  flushList("end");
  return blocks;
}

function InlineDescription({
  value,
  onSave,
}: {
  value: string;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [draft, setDraft] = useState(value);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing && mode === "edit") taRef.current?.focus();
  }, [editing, mode]);

  const commit = () => {
    if (draft !== value) onSave(draft);
    setEditing(false);
  };

  const wrapSelection = (before: string, after = before) => {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const selected = draft.slice(start, end);
    const next = draft.slice(0, start) + before + selected + after + draft.slice(end);
    setDraft(next);
    setTimeout(() => {
      ta.focus();
      const pos = start + before.length + selected.length + after.length;
      ta.setSelectionRange(pos, pos);
    }, 0);
  };

  const prefixLines = (prefix: string) => {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const selected = draft.slice(start, end) || "";
    const lines = selected.split(/\n/).map((l) => (l ? `${prefix}${l}` : `${prefix}`));
    const replaced = lines.join("\n");
    const next = draft.slice(0, start) + replaced + draft.slice(end);
    setDraft(next);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start, start + replaced.length);
    }, 0);
  };

  // Cmd/Ctrl+Enter saves, Esc cancels — keeps power users from reaching for the mouse.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setDraft(value);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <div
        className={cn(
          "rounded-lg border bg-white transition dark:bg-slate-900/40",
          mode === "edit"
            ? "border-primary/40 ring-1 ring-primary/10"
            : "border-border/60",
        )}
      >
        {/* Slim toolbar — single row that never wraps. Format buttons hide on narrow widths so Save/Cancel stay visible. */}
        <div className="flex flex-nowrap items-center gap-0.5 overflow-hidden whitespace-nowrap border-b border-border/50 px-1.5 py-1">
          <button
            type="button"
            onClick={() => setMode("edit")}
            className={cn(
              "rounded px-2 py-0.5 text-[11px] font-medium transition",
              mode === "edit"
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800",
            )}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => setMode("preview")}
            className={cn(
              "rounded px-2 py-0.5 text-[11px] font-medium transition",
              mode === "preview"
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800",
            )}
          >
            Preview
          </button>

          {mode === "edit" && (
            <div className="ml-1 hidden items-center gap-0.5 overflow-hidden border-l border-border/50 pl-1 text-slate-400 md:flex">
              <IconBtn title="Bold" onClick={() => wrapSelection("**")}>
                <span className="text-[11px] font-bold">B</span>
              </IconBtn>
              <IconBtn title="Italic" onClick={() => wrapSelection("*")}>
                <span className="text-[11px] italic">I</span>
              </IconBtn>
              <IconBtn title="Inline code" onClick={() => wrapSelection("`")}>
                <span className="font-mono text-[11px]">{"<>"}</span>
              </IconBtn>
              <IconBtn title="Link" onClick={() => wrapSelection("[", "](url)")}>
                <LinkIcon className="size-3" />
              </IconBtn>
              <div className="mx-0.5 h-3 w-px bg-border/60" />
              <IconBtn title="Bulleted list" onClick={() => prefixLines("- ")}>
                <ListIcon className="size-3" />
              </IconBtn>
              <IconBtn title="Numbered list" onClick={() => prefixLines("1. ")}>
                <ListOrderedIcon className="size-3" />
              </IconBtn>
              <IconBtn title="Quote" onClick={() => prefixLines("> ")}>
                <QuoteIcon className="size-3" />
              </IconBtn>
            </div>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <button
              type="button"
              className="rounded px-2 py-0.5 text-[11px] text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              onClick={() => {
                setDraft(value);
                setEditing(false);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              title="⌘↵ to save, Esc to cancel"
              className="rounded bg-primary px-2.5 py-1 text-[11px] font-semibold text-white hover:brightness-110 disabled:opacity-40"
              onClick={commit}
              disabled={draft === value}
            >
              Save
            </button>
          </div>
        </div>

        {mode === "edit" ? (
          <TextArea
            ref={taRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Write a description… Markdown supported."
            className="min-h-[160px] resize-y border-0 bg-transparent p-3 text-sm leading-relaxed focus:ring-0"
          />
        ) : (
          <div className="min-h-[160px] space-y-1.5 p-3 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
            {draft ? (
              renderMarkdownLite(draft)
            ) : (
              <span className="italic text-slate-400">Nothing to preview</span>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setMode("edit");
        setEditing(true);
      }}
      className="group relative block w-full rounded-lg border border-transparent px-3 py-2 text-left text-sm leading-relaxed text-slate-600 transition hover:border-border/60 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/50"
    >
      {value ? (
        <div className="space-y-1.5">{renderMarkdownLite(value)}</div>
      ) : (
        <span className="italic text-slate-400">No description. Click to add.</span>
      )}
      <Pencil className="absolute right-2 top-2 size-3.5 opacity-0 transition group-hover:opacity-50" />
    </button>
  );
}

function IconBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="inline-flex size-6 items-center justify-center rounded text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
    >
      {children}
    </button>
  );
}


function SectionHeader({
  icon,
  title,
  count,
  right,
  collapsible,
  open,
  onToggle,
}: {
  icon: React.ReactNode;
  title: string;
  count?: number;
  right?: React.ReactNode;
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
}) {
  const content = (
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
      {collapsible ? (
        open ? (
          <ChevronDown className="size-3.5" />
        ) : (
          <ChevronRight className="size-3.5" />
        )
      ) : (
        <span className="flex size-3.5 items-center justify-center text-slate-400">{icon}</span>
      )}
      <span>{title}</span>
      {typeof count === "number" && (
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          {count}
        </span>
      )}
    </div>
  );

  return (
    <div className="flex items-center justify-between">
      {collapsible ? (
        <button type="button" onClick={onToggle} className="flex items-center gap-2">
          {content}
        </button>
      ) : (
        content
      )}
      {right}
    </div>
  );
}

// --------------------------------------------------------------------------
// Main component
// --------------------------------------------------------------------------

export function TaskDetailDrawer({ taskId, onClose }: Props) {
  const qc = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const usersQuery = useUsers();
  // Exclude CLIENT users — they can't be assigned tasks.
  const users = staffOnly(
    toArray<{
      id: string;
      firstName: string;
      lastName: string;
      roles?: Array<{ role?: { code?: string } } | string>;
    }>(usersQuery.data),
  );

  const taskQuery = useQuery({
    queryKey: ["task", taskId],
    queryFn: () => apiFetch<Task>(`/tasks/${taskId}`),
    enabled: !!taskId,
  });

  const task = taskQuery.data ?? null;
  const projectId = task?.projectId;

  const projectQuery = useProject(projectId ?? "");
  const project = projectQuery.data as { id?: string; name?: string } | undefined;

  const labelsQuery = useLabels(projectId);
  const projectLabels = toArray<LabelRef>(labelsQuery.data);

  const sprintsQuery = useSprints(projectId);
  const projectSprints = toArray<{ id: string; name: string; status: string }>(sprintsQuery.data);

  const statusesQuery = useProjectStatuses(projectId ?? null);
  const projectCustomStatuses = toArray<CustomStatusOption>(statusesQuery.data).sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  );

  const milestonesQuery = useProjectMilestones(projectId ?? null);
  const projectMilestones = (Array.isArray(milestonesQuery.data) ? milestonesQuery.data : []) as Array<{
    id: string;
    title: string;
    status?: string;
  }>;

  const projectTasksQuery = useQuery({
    queryKey: ["project-tasks", projectId],
    queryFn: () =>
      apiFetch<{ data?: TaskRef[] }>(`/tasks?projectId=${projectId}&pageSize=200`).then(
        (r) => r.data ?? [],
      ),
    enabled: !!projectId,
  });
  const projectTasks = toArray<TaskRef>(projectTasksQuery.data);

  const updateMutation = useUpdateTask(taskId ?? "");
  const deleteMutation = useDeleteTask();
  const commentMutation = useAddTaskComment(taskId ?? "");
  const addLabelMutation = useAddTaskLabel();
  const removeLabelMutation = useRemoveTaskLabel();
  const createLabelMutation = useCreateLabel();
  const addDependencyMutation = useAddTaskDependency();

  const removeDependencyMutation = useMutation({
    mutationFn: ({ tId, blockingId }: { tId: string; blockingId: string }) =>
      apiDelete(`/tasks/${tId}/dependencies/${blockingId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tasks"] });
      void qc.invalidateQueries({ queryKey: ["task", taskId] });
    },
  });

  const addSubtaskMutation = useMutation({
    mutationFn: (data: { projectId: string; title: string; parentId: string }) =>
      apiPost("/tasks", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tasks"] });
      void qc.invalidateQueries({ queryKey: ["task", taskId] });
    },
  });

  const updateSubtaskMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiFetch(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tasks"] });
      void qc.invalidateQueries({ queryKey: ["task", taskId] });
    },
  });

  const [commentText, setCommentText] = useState("");
  const [blockerConfirmOpen, setBlockerConfirmOpen] = useState(false);
  const [blockerCount, setBlockerCount] = useState(0);
  const [addLabelOpen, setAddLabelOpen] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("#6366f1");
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [addDepOpen, setAddDepOpen] = useState(false);
  const [depsOpen, setDepsOpen] = useState(true);
  const [activityOpen, setActivityOpen] = useState(false);

  if (!taskId) return null;

  const handleUpdate = (field: string, value: unknown) => {
    updateMutation.mutate({ [field]: value } as Record<string, unknown>);
  };

  const unresolvedBlockerCount = (() => {
    const deps = (task?.blockedBy ?? task?.dependencies ?? []) as Dependency[];
    return deps.filter((d) => {
      const st = d.blocking?.status ?? d.status;
      return st && st !== "DONE";
    }).length;
  })();

  const handleStatusChange = (newStatus: string) => {
    if (!task) return;
    if (newStatus === "DONE" && unresolvedBlockerCount > 0) {
      setBlockerCount(unresolvedBlockerCount);
      setBlockerConfirmOpen(true);
      return;
    }
    updateMutation.mutate({ status: newStatus } as Record<string, unknown>, {
      onError: (err: any) => {
        // Fallback: if server reports blocker error, show confirm to force
        const msg = String(err?.message ?? "").toLowerCase();
        if (newStatus === "DONE" && (msg.includes("block") || msg.includes("depend"))) {
          setBlockerCount(unresolvedBlockerCount || 1);
          setBlockerConfirmOpen(true);
        }
      },
    });
  };

  const confirmForceDone = () => {
    updateMutation.mutate(
      { status: "DONE", force: true } as Record<string, unknown>,
      { onSettled: () => setBlockerConfirmOpen(false) },
    );
  };

  const handleDelete = () => {
    if (task && confirm(`Delete task "${task.title}"?`)) {
      deleteMutation.mutate(task.id, { onSuccess: onClose });
    }
  };

  const handleAddComment = () => {
    if (!commentText.trim()) return;
    commentMutation.mutate(
      { content: commentText },
      { onSuccess: () => setCommentText("") },
    );
  };

  const currentLabelIds = new Set((task?.labels ?? []).map((tl) => tl.label.id));

  const handleToggleLabel = (labelId: string) => {
    if (!task) return;
    if (currentLabelIds.has(labelId)) {
      removeLabelMutation.mutate({ taskId: task.id, labelId });
    } else {
      addLabelMutation.mutate({ taskId: task.id, labelId });
    }
  };

  const handleCreateLabel = () => {
    if (!newLabelName.trim() || !projectId) return;
    createLabelMutation.mutate(
      { name: newLabelName.trim(), color: newLabelColor, projectId },
      {
        onSuccess: () => {
          setNewLabelName("");
          void qc.invalidateQueries({ queryKey: ["labels", projectId] });
        },
      },
    );
  };

  const handleAddSubtask = () => {
    if (!newSubtaskTitle.trim() || !task) return;
    addSubtaskMutation.mutate(
      { projectId: task.projectId, title: newSubtaskTitle.trim(), parentId: task.id },
      { onSuccess: () => setNewSubtaskTitle("") },
    );
  };

  const existingDepIds = new Set(
    (task?.dependencies ?? [])
      .map((d) => d.blocking?.id ?? d.blockingId)
      .filter(Boolean) as string[],
  );
  const availableDependencyTasks = projectTasks.filter(
    (t) => t.id !== task?.id && !existingDepIds.has(t.id),
  );

  const shortId = task ? `#${task.id.slice(0, 6).toUpperCase()}` : "";
  const isAdmin = !!currentUser?.roles?.some((r) =>
    ["ADMIN", "SUPER_ADMIN", "OWNER"].includes(r.toUpperCase()),
  );

  return (
    <>
    <Drawer
      open={!!taskId}
      onOpenChange={(open) => !open && onClose()}
      title="Task Details"
      size="xl"
    >
      {taskQuery.isLoading ? (
        <div className="flex items-center justify-center py-12 text-sm text-slate-400">
          Loading task details…
        </div>
      ) : taskQuery.isError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-6 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-400">
          <div className="font-medium">Failed to load task</div>
          <div className="mt-1 text-xs opacity-80">
            {(taskQuery.error as Error)?.message ?? "Unknown error"}
          </div>
        </div>
      ) : !task ? (
        <div className="text-sm text-slate-400">Task not found</div>
      ) : (
        <div className="flex h-full flex-col">
          {/* Breadcrumb + timer */}
          <div className="flex items-center justify-between gap-3 pb-2 text-xs">
            <div className="flex min-w-0 items-center gap-1.5 text-slate-500 dark:text-slate-400">
              {project?.name ? (
                <Link
                  href={`/projects/${task.projectId}`}
                  className="truncate font-medium hover:text-primary hover:underline"
                >
                  {project.name}
                </Link>
              ) : (
                <span className="truncate">Project</span>
              )}
              <span className="text-slate-300 dark:text-slate-600">·</span>
              <span className="font-mono text-[11px] text-slate-400">{shortId}</span>
            </div>
            <TaskTimerButton taskId={task.id} size="sm" showLabel />
          </div>

          {/* Title */}
          <div className="pb-4">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <InlineTitle value={task.title} onSave={(v) => handleUpdate("title", v)} />
              </div>
              <WatchersControl taskId={task.id} currentUserId={currentUser?.id ?? null} />
            </div>
          </div>

          {/* Two-column body — the explicit 300px sidebar + minmax(0,1fr)
              main keeps either column from inflating. Width-overflow is
              controlled by `min-w-0` on each column and `overflow-hidden`
              on PropertyRow value cells; do NOT add overflow-hidden to
              the grid itself or the drawer's own vertical scroll breaks
              and Time Tracking / Activity below the fold gets clipped. */}
          <div className="grid flex-1 grid-cols-1 gap-6 pb-6 md:grid-cols-[minmax(0,1fr)_300px]">
            {/* MAIN */}
            <div className="min-w-0 space-y-6">
              {/* Description */}
              <div>
                <SectionHeader icon={<Pencil className="size-3" />} title="Description" />
                <div className="mt-2">
                  <InlineDescription
                    value={task.description ?? ""}
                    onSave={(v) => handleUpdate("description", v)}
                  />
                </div>
              </div>

              {/* Subtasks */}
              <div>
                <SectionHeader
                  icon={<CheckSquare className="size-3" />}
                  title="Subtasks"
                  count={(task.subtasks ?? []).length}
                />
                <div className="mt-2 space-y-1">
                  {(task.subtasks ?? []).map((st) => {
                    const done = st.status === "DONE";
                    return (
                      <div
                        key={st.id}
                        className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            updateSubtaskMutation.mutate({
                              id: st.id,
                              status: done ? "TODO" : "DONE",
                            })
                          }
                          className="flex size-4 shrink-0 items-center justify-center text-slate-400 hover:text-primary"
                          aria-label={done ? "Mark as not done" : "Mark as done"}
                        >
                          {done ? (
                            <CheckSquare className="size-4 text-emerald-500" />
                          ) : (
                            <Square className="size-4" />
                          )}
                        </button>
                        <span
                          className={cn(
                            "flex-1 truncate",
                            done && "text-slate-400 line-through",
                          )}
                        >
                          {st.title}
                        </span>
                        <StatusBadge status={st.status} size="sm" />
                      </div>
                    );
                  })}
                  <div className="flex items-center gap-2 pt-1">
                    <Plus className="size-3.5 text-slate-400" />
                    <input
                      value={newSubtaskTitle}
                      onChange={(e) => setNewSubtaskTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddSubtask();
                        }
                      }}
                      placeholder="Add a subtask…"
                      className="flex-1 border-none bg-transparent text-sm outline-none placeholder:text-slate-400"
                    />
                    {newSubtaskTitle.trim() && (
                      <Button
                        size="sm"
                        onClick={handleAddSubtask}
                        disabled={addSubtaskMutation.isPending}
                      >
                        Add
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Dependencies */}
              <div>
                <SectionHeader
                  icon={<Link2 className="size-3" />}
                  title="Dependencies"
                  count={(task.dependencies ?? []).length}
                  collapsible
                  open={depsOpen}
                  onToggle={() => setDepsOpen((v) => !v)}
                />
                {depsOpen && (
                  <div className="mt-2 space-y-1">
                    {(task.dependencies ?? []).length === 0 && (
                      <div className="px-2 text-xs text-slate-400">Nothing blocking this task.</div>
                    )}
                    {(task.dependencies ?? []).map((dep) => {
                      const blockingId = dep.blocking?.id ?? dep.blockingId;
                      const depTitle = dep.blocking?.title ?? dep.title ?? "Untitled";
                      const depStatus = dep.blocking?.status ?? dep.status;
                      return (
                        <div
                          key={dep.id}
                          className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50"
                        >
                          <Link2 className="size-3.5 shrink-0 text-slate-400" />
                          <span className="flex-1 truncate">{depTitle}</span>
                          {depStatus && <StatusBadge status={depStatus} size="sm" />}
                          {blockingId && (
                            <button
                              type="button"
                              className="opacity-0 transition-opacity group-hover:opacity-100 text-slate-400 hover:text-red-500"
                              onClick={() =>
                                removeDependencyMutation.mutate({
                                  tId: task.id,
                                  blockingId,
                                })
                              }
                              aria-label="Remove dependency"
                            >
                              <X className="size-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                    <DropdownMenu open={addDepOpen} onOpenChange={setAddDepOpen}>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                        >
                          <Plus className="size-3" /> Add dependency
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="max-h-72 w-72 overflow-y-auto">
                        {availableDependencyTasks.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-slate-400">
                            No available tasks
                          </div>
                        ) : (
                          availableDependencyTasks.map((t) => (
                            <DropdownMenuItem
                              key={t.id}
                              onSelect={(e) => {
                                e.preventDefault();
                                addDependencyMutation.mutate(
                                  { taskId: task.id, blockingId: t.id },
                                  { onSuccess: () => setAddDepOpen(false) },
                                );
                              }}
                            >
                              <span className="truncate">{t.title ?? "Untitled"}</span>
                            </DropdownMenuItem>
                          ))
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>

              {/* Attachments */}
              {task.attachments && task.attachments.length > 0 && (
                <div>
                  <SectionHeader
                    icon={<Paperclip className="size-3" />}
                    title="Attachments"
                    count={task.attachments.length}
                  />
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {task.attachments.map((a) => (
                      <AttachmentRow key={a.id} attachment={a} />
                    ))}
                  </div>
                </div>
              )}

              {/* Comments */}
              <div>
                <SectionHeader
                  icon={<MessageSquare className="size-3" />}
                  title="Comments"
                  count={task.comments?.length ?? 0}
                />
                <div className="mt-3 space-y-3">
                  {task.comments && task.comments.length > 0 ? (
                    task.comments.map((c) => (
                      <div key={c.id} className="flex gap-2.5">
                        <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-[10px] font-bold text-white">
                          {initialsOf(c.author?.firstName, c.author?.lastName)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                              {c.author?.firstName} {c.author?.lastName}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                            </span>
                          </div>
                          <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">
                            {renderCommentContent(c.content)}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="px-2 text-xs text-slate-400">No comments yet.</p>
                  )}
                  <div className="flex items-start gap-2 pt-2">
                    <span className="mt-1 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                      {(currentUser?.email?.[0] ?? "?").toUpperCase()}
                    </span>
                    <CommentComposer
                      taskId={taskId}
                      value={commentText}
                      onChange={setCommentText}
                      onSubmit={handleAddComment}
                      submitting={commentMutation.isPending}
                    />
                  </div>
                </div>
              </div>

              {/* Activity — real history from ActivityLog (lazily fetched) */}
              <div>
                <SectionHeader
                  icon={<Clock className="size-3" />}
                  title="Activity"
                  collapsible
                  open={activityOpen}
                  onToggle={() => setActivityOpen((v) => !v)}
                />
                {activityOpen && <ActivityFeed taskId={task.id} />}
              </div>
            </div>

            {/* PROPERTIES SIDEBAR — min-w-0 prevents any long chip text
                from blowing past the 300px slot and clipping main content. */}
            <aside className="min-w-0 space-y-5 md:border-l md:border-border/60 md:pl-5">
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Properties
                </div>
                <div className="divide-y divide-border/40">
                  <PropertyRow icon={<Circle className="size-3" />} label="Status">
                    <StatusChip
                      value={task.status}
                      onChange={(v) => handleStatusChange(v)}
                      customStatuses={projectCustomStatuses.length ? projectCustomStatuses : undefined}
                      customStatusId={task.customStatusId ?? null}
                      onChangeCustom={(id) => handleUpdate("customStatusId", id)}
                    />
                  </PropertyRow>
                  <PropertyRow icon={<Flag className="size-3" />} label="Priority">
                    <PriorityChip
                      value={task.priority}
                      onChange={(v) => handleUpdate("priority", v)}
                    />
                  </PropertyRow>
                  <PropertyRow icon={<User className="size-3" />} label="Assignee">
                    <AssigneeChip
                      value={task.assignedToId}
                      users={users}
                      onChange={(v) => handleUpdate("assignedToId", v)}
                    />
                  </PropertyRow>
                  <PropertyRow icon={<Rocket className="size-3" />} label="Sprint">
                    <SprintChip
                      value={(task as any).sprintId}
                      sprints={projectSprints}
                      onChange={(v) => handleUpdate("sprintId", v)}
                    />
                  </PropertyRow>
                  <PropertyRow icon={<Calendar className="size-3" />} label="Start">
                    <StartDateChip
                      value={task.startDate}
                      onChange={(iso) => handleUpdate("startDate", iso)}
                    />
                  </PropertyRow>
                  <PropertyRow icon={<Calendar className="size-3" />} label="Due">
                    <DueDateChip
                      value={task.dueDate}
                      onChange={(iso) => handleUpdate("dueDate", iso)}
                    />
                  </PropertyRow>
                  <PropertyRow icon={<Target className="size-3" />} label="Milestone">
                    <MilestoneChip
                      value={task.milestoneId ?? task.milestone?.id ?? null}
                      milestones={projectMilestones}
                      onChange={(v) => handleUpdate("milestoneId", v ?? "")}
                    />
                  </PropertyRow>
                  <PropertyRow icon={<Hash className="size-3" />} label="Points">
                    <NumberInput
                      value={task.storyPoints ?? null}
                      onChange={(v) => handleUpdate("storyPoints", v)}
                      className="!h-8 !w-20 !rounded-md !px-2 !text-xs"
                    />
                  </PropertyRow>
                  <PropertyRow icon={<Clock className="size-3" />} label="Est. hrs">
                    {(() => {
                      const manualEst = (task as any).estimatedHrs as number | null | undefined;
                      const rollup = task.rollup;
                      const hasChildren = !!rollup && rollup.childCount > 0;
                      const manualMissing = !manualEst;
                      if (hasChildren && manualMissing && rollup!.estimatedHrs != null) {
                        return (
                          <div className="flex flex-col gap-0.5">
                            <span
                              className="inline-flex h-8 items-center rounded-md bg-slate-50 px-2 text-xs font-semibold text-slate-700 dark:bg-slate-800/60 dark:text-slate-200"
                              title="Derived from subtasks — edit individual subtasks to change."
                            >
                              {rollup!.estimatedHrs}h
                            </span>
                            <span className="text-[10px] italic text-slate-400">
                              rolled up from {rollup!.childCount} subtask
                              {rollup!.childCount === 1 ? "" : "s"}
                            </span>
                          </div>
                        );
                      }
                      return (
                        <NumberInput
                          value={manualEst ?? null}
                          onChange={(v) => handleUpdate("estimatedHrs", v)}
                          suffix="h"
                          className="!h-8 !w-20 !rounded-md !pl-2 !pr-7 !text-xs"
                        />
                      );
                    })()}
                  </PropertyRow>
                  <PropertyRow icon={<Circle className="size-3" />} label="Progress">
                    {(() => {
                      const rollup = task.rollup;
                      const hasChildren = !!rollup && rollup.childCount > 0;
                      const rollupPct = rollup?.progressPercent;
                      if (hasChildren && rollupPct != null) {
                        return (
                          <div className="flex w-full flex-col gap-0.5">
                            <div
                              className="flex w-full items-center gap-2 opacity-80"
                              title={`Rolled up from ${rollup!.childCount} subtasks — edit subtask progress instead.`}
                            >
                              <input
                                type="range"
                                min={0}
                                max={100}
                                step={5}
                                value={rollupPct}
                                disabled
                                className="flex-1 accent-primary opacity-70"
                              />
                              <span className="w-10 text-right text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                                {rollupPct}%
                              </span>
                            </div>
                            <span className="text-[10px] italic text-slate-400">
                              rolled up from {rollup!.childCount} subtask
                              {rollup!.childCount === 1 ? "" : "s"}
                            </span>
                          </div>
                        );
                      }
                      return (
                        <ProgressSlider
                          value={(task as any).progressPercent ?? 0}
                          status={task.status}
                          onCommit={(v) => handleUpdate("progressPercent", v)}
                        />
                      );
                    })()}
                  </PropertyRow>
                  <PropertyRow icon={<Eye className="size-3" />} label="Client">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={!!task.isClientVisible}
                        onChange={(e) => handleUpdate("isClientVisible", e.target.checked)}
                      />
                      <span>Visible to client portal</span>
                    </label>
                  </PropertyRow>
                </div>
              </div>

              {/* Labels */}
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <Tag className="size-3" /> Labels
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(task.labels ?? []).map((tl) => (
                    <span
                      key={tl.label.id}
                      className="group inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium"
                      style={{
                        backgroundColor: `${tl.label.color}22`,
                        color: tl.label.color,
                      }}
                    >
                      <span
                        className="size-1.5 rounded-full"
                        style={{ backgroundColor: tl.label.color }}
                      />
                      {tl.label.name}
                      <button
                        type="button"
                        className="opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-70"
                        onClick={() =>
                          removeLabelMutation.mutate({
                            taskId: task.id,
                            labelId: tl.label.id,
                          })
                        }
                        aria-label={`Remove label ${tl.label.name}`}
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                  <DropdownMenu open={addLabelOpen} onOpenChange={setAddLabelOpen}>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-0.5 text-[11px] text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <Plus className="size-3" /> Add
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-64" align="end">
                      {projectLabels.length === 0 && (
                        <div className="px-3 py-2 text-xs text-slate-400">
                          No labels yet
                        </div>
                      )}
                      {projectLabels.map((l) => {
                        const selected = currentLabelIds.has(l.id);
                        return (
                          <DropdownMenuItem
                            key={l.id}
                            onSelect={(e) => {
                              e.preventDefault();
                              handleToggleLabel(l.id);
                            }}
                          >
                            <span
                              className="inline-block size-3 rounded-full"
                              style={{ backgroundColor: l.color }}
                            />
                            <span className="flex-1">{l.name}</span>
                            {selected && <span className="text-xs text-primary">✓</span>}
                          </DropdownMenuItem>
                        );
                      })}
                      <div className="mt-1 space-y-2 border-t px-2 pb-1 pt-2">
                        <div className="text-xs font-semibold text-slate-400">
                          Create new label
                        </div>
                        <Input
                          value={newLabelName}
                          onChange={(e) => setNewLabelName(e.target.value)}
                          placeholder="Label name"
                          className="text-xs"
                        />
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={newLabelColor}
                            onChange={(e) => setNewLabelColor(e.target.value)}
                            className="size-7 rounded border border-border"
                          />
                          <Button
                            size="sm"
                            onClick={handleCreateLabel}
                            disabled={!newLabelName.trim() || createLabelMutation.isPending}
                            className="flex-1"
                          >
                            Create
                          </Button>
                        </div>
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Time tracking */}
              <TimeTrackingSection
                taskId={task.id}
                currentUserId={currentUser?.id ?? null}
                estimatedHrs={(task as any).estimatedHrs ?? null}
              />
            </aside>
          </div>

          {/* Footer */}
          <div className="-mx-6 mt-auto flex items-center justify-between border-t border-border bg-white/80 px-6 py-3 backdrop-blur dark:bg-slate-900/80">
            {isAdmin ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-red-500 hover:text-red-600"
                onClick={handleDelete}
              >
                <Trash2 className="mr-1.5 size-3.5" /> Delete task
              </Button>
            ) : (
              <span />
            )}
            <div className="text-[11px] text-slate-400">
              {task.updatedAt
                ? `Updated ${formatDistanceToNow(new Date(task.updatedAt), { addSuffix: true })}`
                : ""}
            </div>
          </div>
        </div>
      )}
    </Drawer>
    <ConfirmDialog
      open={blockerConfirmOpen}
      onOpenChange={setBlockerConfirmOpen}
      title="Blocked by unresolved tasks"
      description={`This task is blocked by ${blockerCount} other task${blockerCount === 1 ? "" : "s"} that ${blockerCount === 1 ? "isn't" : "aren't"} done. Mark done anyway?`}
      variant="warning"
      confirmLabel="Mark done anyway"
      cancelLabel="Cancel"
      onConfirm={confirmForceDone}
      loading={updateMutation.isPending}
    />
    </>
  );
}

// --------------------------------------------------------------------------
// Time tracking (compact sidebar version)
// --------------------------------------------------------------------------

function ProgressSlider({
  value,
  status,
  onCommit,
}: {
  value: number;
  status: string;
  onCommit: (v: number) => void;
}) {
  const isDone = status === "DONE";
  const effective = isDone ? 100 : value;
  const [local, setLocal] = useState<number>(effective);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocal(effective);
  }, [effective]);

  const handleChange = (v: number) => {
    setLocal(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onCommit(v), 400);
  };

  return (
    <div className="flex w-full items-center gap-2">
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={local}
        disabled={isDone}
        onChange={(e) => handleChange(Number(e.target.value))}
        className="flex-1 accent-primary disabled:opacity-60"
      />
      <span className="w-10 text-right text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-200">
        {local}%
      </span>
    </div>
  );
}

/**
 * Renders the ActivityLog entries for this task. Lazy — only hits the API
 * when the Activity section is expanded. Groups entries by day and renders
 * a Linear-style vertical timeline.
 */
function ActivityFeed({ taskId }: { taskId: string }) {
  const query = useTaskHistory(taskId);
  const rows = toArray<any>(query.data);

  if (query.isLoading) {
    return <div className="mt-2 px-2 text-xs text-slate-400">Loading activity…</div>;
  }
  if (rows.length === 0) {
    return (
      <div className="mt-2 px-2 text-xs italic text-slate-400">
        No activity yet.
      </div>
    );
  }

  const formatAction = (r: any): string => {
    const action = String(r.action ?? "").toLowerCase();
    // `action` is ActivityAction enum — convert CREATED / UPDATED / etc. into readable copy.
    const verbMap: Record<string, string> = {
      created: "created this task",
      updated: "updated this task",
      deleted: "deleted this task",
      assigned: "changed the assignee",
      status_changed: "changed the status",
      commented: "commented",
      completed: "marked this complete",
      reopened: "reopened this task",
    };
    return verbMap[action] ?? r.action ?? "updated";
  };

  return (
    <div className="relative mt-2 space-y-3 pl-5 before:absolute before:left-[7px] before:top-1 before:h-[calc(100%-8px)] before:w-px before:bg-border/60">
      {rows.map((r: any) => {
        const first = `${r.user?.firstName?.[0] ?? ""}${r.user?.lastName?.[0] ?? ""}`.toUpperCase() || "?";
        const verb = formatAction(r);
        return (
          <div key={r.id} className="relative">
            <span className="absolute -left-[18px] top-1 inline-flex size-3 items-center justify-center rounded-full bg-white ring-1 ring-slate-300 dark:bg-slate-900 dark:ring-slate-600" />
            <div className="flex items-baseline gap-2">
              <span
                title={r.user ? `${r.user.firstName} ${r.user.lastName}` : "Unknown"}
                className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[9px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300"
              >
                {first}
              </span>
              <div className="min-w-0 flex-1 text-xs text-slate-600 dark:text-slate-300">
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  {r.user ? `${r.user.firstName} ${r.user.lastName}` : "System"}
                </span>{" "}
                <span className="text-slate-500">{verb}</span>
                {r.details && (
                  <div className="mt-0.5 line-clamp-2 text-[11px] text-slate-500 dark:text-slate-400">
                    {r.details}
                  </div>
                )}
                <div
                  className="mt-0.5 text-[10px] text-slate-400"
                  title={new Date(r.createdAt).toLocaleString()}
                >
                  {new Date(r.createdAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WatchersControl({
  taskId,
  currentUserId,
}: {
  taskId: string;
  currentUserId: string | null;
}) {
  const watchersQuery = useTaskWatchers(taskId);
  const watchMutation = useWatchTask();
  const unwatchMutation = useUnwatchTask();
  const [listOpen, setListOpen] = useState(false);
  const watchers = Array.isArray(watchersQuery.data) ? watchersQuery.data : [];
  // Backend returns flat user rows [{ id, firstName, lastName, ... }] — match by id directly.
  const isWatching = !!currentUserId && watchers.some((w: any) => w.id === currentUserId);

  const toggle = () => {
    if (isWatching) unwatchMutation.mutate(taskId);
    else watchMutation.mutate(taskId);
  };

  return (
    <div className="relative flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition",
          isWatching
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-border/60 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
        )}
        title={isWatching ? "Unwatch task" : "Watch task"}
      >
        {isWatching ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
        <span>{isWatching ? "Watching" : "Watch"}</span>
      </button>
      {watchers.length > 0 && (
        <button
          type="button"
          onClick={() => setListOpen((v) => !v)}
          className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
        >
          {watchers.length} watcher{watchers.length === 1 ? "" : "s"}
        </button>
      )}
      {listOpen && watchers.length > 0 && (
        <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-md border border-border bg-white p-2 shadow-lg dark:bg-slate-900">
          <div className="mb-1 text-[10px] font-semibold uppercase text-slate-400">Watchers</div>
          <div className="max-h-60 space-y-1 overflow-y-auto">
            {watchers.map((w: any) => (
              <div key={w.id} className="flex items-center gap-2 text-xs">
                <span className="inline-flex size-5 items-center justify-center rounded-full bg-indigo-500 text-[9px] font-bold text-white">
                  {initialsOf(w.firstName, w.lastName)}
                </span>
                <span className="truncate">
                  {w.firstName} {w.lastName}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EstimateVsActualChart({ taskId }: { taskId: string }) {
  const q = useTaskEstimateVsActual(taskId);
  const data = (q.data ?? null) as
    | { estimatedHrs?: number; actualHrs?: number; variancePercent?: number }
    | null;
  if (!data) return null;
  const est = Number(data.estimatedHrs ?? 0);
  const act = Number(data.actualHrs ?? 0);
  if (est <= 0) return null;
  const maxVal = Math.max(est, act, 0.0001);
  const estPct = (est / maxVal) * 100;
  const actPct = (act / maxVal) * 100;
  const variance =
    typeof data.variancePercent === "number"
      ? data.variancePercent
      : ((act - est) / est) * 100;
  const overBudget = variance > 0;
  return (
    <div className="mt-3 border-t border-border/50 pt-3">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        Estimate vs Actual
      </div>
      <div className="space-y-1.5">
        <div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Estimated</span>
            <span className="tabular-nums text-slate-700 dark:text-slate-200">{est.toFixed(1)}h</span>
          </div>
          <div className="h-2 overflow-hidden rounded bg-slate-200 dark:bg-slate-700">
            <div className="h-full bg-slate-500" style={{ width: `${estPct}%` }} />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Actual</span>
            <span className="tabular-nums text-slate-700 dark:text-slate-200">{act.toFixed(1)}h</span>
          </div>
          <div className="h-2 overflow-hidden rounded bg-slate-200 dark:bg-slate-700">
            <div
              className={cn("h-full", overBudget ? "bg-red-500" : "bg-emerald-500")}
              style={{ width: `${actPct}%` }}
            />
          </div>
        </div>
      </div>
      <div
        className={cn(
          "mt-2 text-[11px] font-medium",
          overBudget ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400",
        )}
      >
        {overBudget ? "+" : ""}
        {variance.toFixed(0)}% {overBudget ? "over budget" : "under budget"}
      </div>
    </div>
  );
}

function TimeTrackingSection({
  taskId,
  currentUserId,
  estimatedHrs,
}: {
  taskId: string;
  currentUserId: string | null;
  estimatedHrs?: number | null;
}) {
  const activeTimer = useActiveTimer();
  const active = (activeTimer.data ?? null) as {
    id?: string;
    taskId?: string | null;
  } | null;
  const isRunningHere = !!active && active.taskId === taskId;
  const summaryQuery = useTaskTimeSummary(taskId, isRunningHere ? 30_000 : undefined);
  const summary = (summaryQuery.data ?? null) as TaskTimeSummary | null;
  const deleteEntryMutation = useDeleteTimeEntry();
  const [entriesOpen, setEntriesOpen] = useState(false);

  const totalMinutes = summary?.totalMinutes ?? 0;
  const byUser = summary?.byUser ?? [];
  const entries = summary?.entries ?? [];

  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        <Timer className="size-3" /> Time tracking
      </div>
      <div className="rounded-lg border border-border/50 bg-slate-50/60 p-3 dark:bg-slate-800/40">
        <div className="flex items-end justify-between gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Total</div>
            <div className="text-xl font-semibold tabular-nums text-slate-800 dark:text-slate-100">
              {formatDuration(totalMinutes)}
            </div>
          </div>
          <TaskTimerButton taskId={taskId} size="sm" showLabel />
        </div>

        {byUser.length > 0 && (
          <div className="mt-3 space-y-1 border-t border-border/50 pt-3">
            {byUser.map((bu, idx) => {
              const u = bu.user;
              const initials = u ? initialsOf(u.firstName, u.lastName) : "?";
              const name = u
                ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || "Unknown"
                : "Unknown";
              return (
                <div
                  key={bu.userId ?? u?.id ?? idx}
                  className="flex items-center gap-2 text-xs"
                >
                  <span className="inline-flex size-5 items-center justify-center rounded-full bg-indigo-500 text-[9px] font-bold text-white">
                    {initials}
                  </span>
                  <span className="flex-1 truncate">{name}</span>
                  <span className="tabular-nums text-slate-500 dark:text-slate-400">
                    {formatDuration(bu.minutes)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {entries.length > 0 && (
          <div className="mt-3 border-t border-border/50 pt-2">
            <button
              type="button"
              onClick={() => setEntriesOpen((v) => !v)}
              className="flex w-full items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <span>Entries ({entries.length})</span>
              {entriesOpen ? (
                <ChevronDown className="size-3" />
              ) : (
                <ChevronRight className="size-3" />
              )}
            </button>
            {entriesOpen && (
              <div className="mt-2 space-y-1.5">
                {entries.map((entry) => {
                  const start = new Date(entry.startTime);
                  const end = entry.endTime ? new Date(entry.endTime) : null;
                  const dur =
                    entry.duration ??
                    (end ? Math.round((end.getTime() - start.getTime()) / 60000) : 0);
                  const u = entry.user;
                  const name = u
                    ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || "Unknown"
                    : "Unknown";
                  const ownerId = entry.userId ?? u?.id;
                  const canDelete = !!currentUserId && ownerId === currentUserId;
                  return (
                    <div
                      key={entry.id}
                      className="flex items-start gap-2 rounded-md bg-white/70 px-2 py-1.5 text-[11px] dark:bg-slate-900/40"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium">{name}</span>
                          <span className="tabular-nums text-slate-400">
                            {start.toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                          <span className="ml-auto tabular-nums font-medium">
                            {end ? (
                              formatDuration(dur)
                            ) : (
                              <span className="text-red-500">Running</span>
                            )}
                          </span>
                        </div>
                        {entry.notes && (
                          <div className="truncate text-slate-500 dark:text-slate-400">
                            {entry.notes}
                          </div>
                        )}
                      </div>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm("Delete this time entry?")) {
                              deleteEntryMutation.mutate(entry.id);
                            }
                          }}
                          className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                          aria-label="Delete time entry"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {entries.length === 0 && !summaryQuery.isLoading && (
          <div className="mt-2 text-[11px] text-slate-400">
            No time logged. Start the timer to track work.
          </div>
        )}

        {typeof estimatedHrs === "number" && estimatedHrs > 0 && (
          <EstimateVsActualChart taskId={taskId} />
        )}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Attachment preview
// --------------------------------------------------------------------------

type AttachmentKind = "image" | "pdf" | "other";

function classifyAttachment(name: string): AttachmentKind {
  const lower = name.toLowerCase();
  if (/\.(jpe?g|png|gif|webp|svg|bmp)$/.test(lower)) return "image";
  if (/\.pdf$/.test(lower)) return "pdf";
  return "other";
}

function AttachmentRow({ attachment }: { attachment: Attachment }) {
  const name = attachment.originalName ?? attachment.filename ?? "File";
  const kind = classifyAttachment(name);
  const url = attachment.url;
  const [previewOpen, setPreviewOpen] = useState(false);

  const canPreview = !!url && (kind === "image" || kind === "pdf");

  return (
    <>
      <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-slate-50/60 px-3 py-2 text-sm dark:bg-slate-800/40">
        {kind === "image" && url ? (
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="group relative size-12 shrink-0 overflow-hidden rounded-md border border-border/60 bg-slate-100 dark:bg-slate-800"
            aria-label={`Preview ${name}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={name}
              className="size-full object-cover transition group-hover:scale-105"
            />
          </button>
        ) : kind === "pdf" ? (
          <button
            type="button"
            onClick={() => url && setPreviewOpen(true)}
            className="flex size-12 shrink-0 items-center justify-center rounded-md bg-red-50 text-red-500 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20"
            aria-label={`Preview ${name}`}
            disabled={!url}
          >
            <FileText className="size-5" />
          </button>
        ) : (
          <Paperclip className="size-4 shrink-0 text-slate-400" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium">{name}</div>
          <div className="truncate text-[11px] text-slate-400">
            {formatFileSize(attachment.fileSize)}
            {attachment.uploadedBy
              ? ` · ${attachment.uploadedBy.firstName ?? ""} ${attachment.uploadedBy.lastName ?? ""}`
              : ""}
          </div>
        </div>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700"
          >
            <Download className="size-3.5" />
          </a>
        )}
      </div>

      {canPreview && url && (
        <AttachmentPreviewDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          url={url}
          filename={name}
          kind={kind}
        />
      )}
    </>
  );
}

function AttachmentPreviewDialog({
  open,
  onOpenChange,
  url,
  filename,
  kind,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  url: string;
  filename: string;
  kind: AttachmentKind;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-8">{filename}</DialogTitle>
        </DialogHeader>
        {kind === "image" ? (
          <div className="flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={filename}
              className="max-h-[75vh] w-auto max-w-full rounded-md object-contain"
            />
          </div>
        ) : kind === "pdf" ? (
          <iframe src={url} className="h-[70vh] w-full rounded-md border border-border/50" />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
