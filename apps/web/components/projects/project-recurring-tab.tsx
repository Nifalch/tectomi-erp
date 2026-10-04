"use client";
import { useState } from "react";
import { Plus, Play, Pause, Square, Trash2, Pencil, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { FormField } from "@/components/ui/form";
import { DatePicker } from "@/components/ui/date-picker";
import { useRecurringTasks, useUsers } from "@/lib/api/hooks";
import {
  useCreateRecurringTask,
  useDeleteRecurringTask,
  usePauseRecurringTask,
  useResumeRecurringTask,
  useEndRecurringTask,
  useRunDueRecurringTasks,
  useUpdateRecurringTask,
} from "@/lib/api/mutations";
import { toArray } from "@/lib/utils";

interface RecurringRow {
  id: string;
  title: string;
  description?: string;
  frequency: string;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  status?: string;
  priority?: string;
  storyPoints?: number;
  estHours?: number;
  startDate?: string;
  endDate?: string;
  assignedToId?: string | null;
  sprintAssign?: boolean;
  assignedTo?: { id: string; firstName: string; lastName: string } | null;
}

interface UserRow { id: string; firstName: string; lastName: string }

const FREQ_OPTIONS = [
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
];

const PRIORITY_OPTIONS = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

const DAYS_OF_WEEK = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

function formatDate(s?: string | null) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString();
  } catch {
    return "—";
  }
}

function UpdateRow({ row, onClose }: { row: RecurringRow; onClose: () => void }) {
  const update = useUpdateRecurringTask(row.id);
  const [title, setTitle] = useState(row.title);
  const [description, setDescription] = useState(row.description ?? "");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>Edit recurring task</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <FormField label="Title" required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </FormField>
          <FormField label="Description">
            <TextArea value={description} onChange={(e) => setDescription(e.target.value)} />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            disabled={update.isPending || !title.trim()}
            onClick={() =>
              update.mutate(
                { title, description },
                { onSuccess: onClose },
              )
            }
          >Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProjectRecurringTab({ projectId }: { projectId: string }) {
  const query = useRecurringTasks(projectId);
  const usersQuery = useUsers();
  const createMutation = useCreateRecurringTask();
  const deleteMutation = useDeleteRecurringTask();
  const pauseMutation = usePauseRecurringTask();
  const resumeMutation = useResumeRecurringTask();
  const endMutation = useEndRecurringTask();
  const runDue = useRunDueRecurringTasks();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<RecurringRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RecurringRow | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [assignedToId, setAssignedToId] = useState("");
  const [frequency, setFrequency] = useState("WEEKLY");
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [storyPoints, setStoryPoints] = useState("");
  const [estHours, setEstHours] = useState("");
  const [autoAssign, setAutoAssign] = useState(false);

  const rows = toArray<RecurringRow>(query.data);
  const users = toArray<UserRow>(usersQuery.data);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setPriority("MEDIUM");
    setAssignedToId("");
    setFrequency("WEEKLY");
    setDayOfWeek("1");
    setDayOfMonth("1");
    setStartDate(undefined);
    setEndDate(undefined);
    setStoryPoints("");
    setEstHours("");
    setAutoAssign(false);
  };

  const handleCreate = () => {
    if (!title.trim()) return;
    const payload: Record<string, unknown> = {
      projectId,
      title,
      description: description || undefined,
      priority,
      frequency,
      assignedToId: assignedToId || undefined,
      startDate: startDate?.toISOString(),
      endDate: endDate?.toISOString(),
      storyPoints: storyPoints ? Number(storyPoints) : undefined,
      estimatedHrs: estHours ? Number(estHours) : undefined,
      sprintAssign: autoAssign,
    };
    if (frequency === "WEEKLY") payload.dayOfWeek = Number(dayOfWeek);
    if (frequency === "MONTHLY") payload.dayOfMonth = Number(dayOfMonth);
    createMutation.mutate(payload, {
      onSuccess: () => {
        setCreateOpen(false);
        resetForm();
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Recurring Tasks</h3>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => runDue.mutate()} disabled={runDue.isPending}>
            <RefreshCw className="mr-1 size-4" /> {runDue.isPending ? "Running..." : "Run due now"}
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 size-4" /> New Recurring Task
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <Card>
          <div className="py-8 text-center text-sm text-slate-400">
            No recurring tasks yet. Create one to auto-generate tasks on a schedule.
          </div>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border/60 text-xs text-slate-500">
                <tr>
                  <th className="py-2 pr-3 text-left font-medium">Title</th>
                  <th className="py-2 pr-3 text-left font-medium">Frequency</th>
                  <th className="py-2 pr-3 text-left font-medium">Next run</th>
                  <th className="py-2 pr-3 text-left font-medium">Last run</th>
                  <th className="py-2 pr-3 text-left font-medium">Assigned to</th>
                  <th className="py-2 pr-3 text-left font-medium">Status</th>
                  <th className="py-2 pr-3 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isPaused = r.status === "PAUSED";
                  const isEnded = r.status === "ENDED";
                  return (
                    <tr key={r.id} className="border-b border-border/30 last:border-0">
                      <td className="py-2 pr-3 font-medium">{r.title}</td>
                      <td className="py-2 pr-3">{r.frequency}</td>
                      <td className="py-2 pr-3 text-xs text-slate-500">{formatDate(r.nextRunAt)}</td>
                      <td className="py-2 pr-3 text-xs text-slate-500">{formatDate(r.lastRunAt)}</td>
                      <td className="py-2 pr-3 text-xs text-slate-500">
                        {r.assignedTo ? `${r.assignedTo.firstName} ${r.assignedTo.lastName}` : "—"}
                      </td>
                      <td className="py-2 pr-3">
                        <Badge
                          tone={isEnded ? "neutral" : isPaused ? "warning" : "positive"}
                          size="sm"
                          dot
                        >
                          {r.status ?? "ACTIVE"}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setEditTarget(r)}>
                            <Pencil className="size-3.5" />
                          </Button>
                          {!isEnded && (isPaused ? (
                            <Button size="sm" variant="ghost" onClick={() => resumeMutation.mutate(r.id)}>
                              <Play className="size-3.5" />
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => pauseMutation.mutate(r.id)}>
                              <Pause className="size-3.5" />
                            </Button>
                          ))}
                          {!isEnded && (
                            <Button size="sm" variant="ghost" onClick={() => endMutation.mutate(r.id)}>
                              <Square className="size-3.5" />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(r)}>
                            <Trash2 className="size-3.5 text-red-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetForm(); }}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>New recurring task</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <FormField label="Title" required>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </FormField>
            <FormField label="Description">
              <TextArea value={description} onChange={(e) => setDescription(e.target.value)} />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Priority">
                <Select value={priority} onValueChange={setPriority} options={PRIORITY_OPTIONS} />
              </FormField>
              <FormField label="Assignee">
                <Select
                  value={assignedToId}
                  onValueChange={setAssignedToId}
                  placeholder="Unassigned"
                  options={[
                    { value: "", label: "Unassigned" },
                    ...users.map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName}` })),
                  ]}
                />
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Frequency">
                <Select value={frequency} onValueChange={setFrequency} options={FREQ_OPTIONS} />
              </FormField>
              {frequency === "WEEKLY" && (
                <FormField label="Day of week">
                  <Select value={dayOfWeek} onValueChange={setDayOfWeek} options={DAYS_OF_WEEK} />
                </FormField>
              )}
              {frequency === "MONTHLY" && (
                <FormField label="Day of month">
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={dayOfMonth}
                    onChange={(e) => setDayOfMonth(e.target.value)}
                  />
                </FormField>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Start date">
                <DatePicker value={startDate} onChange={setStartDate} />
              </FormField>
              <FormField label="End date">
                <DatePicker value={endDate} onChange={setEndDate} />
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Story points">
                <Input type="number" value={storyPoints} onChange={(e) => setStoryPoints(e.target.value)} />
              </FormField>
              <FormField label="Est hours">
                <Input type="number" step="0.25" value={estHours} onChange={(e) => setEstHours(e.target.value)} />
              </FormField>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <input
                type="checkbox"
                checked={autoAssign}
                onChange={(e) => setAutoAssign(e.target.checked)}
              />
              Auto-assign generated tasks to the active sprint
            </label>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button disabled={createMutation.isPending || !title.trim()} onClick={handleCreate}>
              {createMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editTarget && <UpdateRow row={editTarget} onClose={() => setEditTarget(null)} />}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete recurring task"
        description={`Delete "${deleteTarget?.title}"? This stops future generation.`}
        variant="destructive"
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteTarget)
            deleteMutation.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
        }}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
