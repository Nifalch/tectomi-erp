"use client";

import { useState } from "react";
import { Phone, Mail, Calendar as CalendarIcon, StickyNote, CheckSquare, Plus, Check } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { FormField } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useActivities, useUsers } from "@/lib/api/hooks";
import { useCreateActivity, useUpdateActivity } from "@/lib/api/mutations";
import { toArray } from "@/lib/utils";

export type ActivityScope = {
  leadId?: string;
  dealId?: string;
  clientId?: string;
  contactId?: string;
};

interface User {
  id: string;
  firstName: string;
  lastName: string;
}

interface Activity {
  id: string;
  type: string;
  subject: string;
  description?: string;
  dueDate?: string;
  completedAt?: string | null;
  createdAt: string;
  assignedToId?: string | null;
  createdBy?: { firstName?: string; lastName?: string } | null;
  assignedTo?: { firstName?: string; lastName?: string } | null;
}

const typeIcon: Record<string, React.ComponentType<{ className?: string }>> = {
  CALL: Phone,
  EMAIL: Mail,
  MEETING: CalendarIcon,
  NOTE: StickyNote,
  TASK: CheckSquare,
};

const typeOptions = [
  { value: "CALL", label: "Call" },
  { value: "EMAIL", label: "Email" },
  { value: "MEETING", label: "Meeting" },
  { value: "NOTE", label: "Note" },
  { value: "TASK", label: "Task" },
];

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

export function ActivityTimeline({ scope }: { scope: ActivityScope }) {
  const query = useActivities(scope);
  const createMutation = useCreateActivity();
  const usersQuery = useUsers();
  const users = toArray<User>(usersQuery.data);

  const [open, setOpen] = useState(false);
  const [type, setType] = useState("NOTE");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [assignedToId, setAssignedToId] = useState<string>("");

  const activities = toArray<Activity>(query.data).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const resetForm = () => {
    setType("NOTE");
    setSubject("");
    setDescription("");
    setDueDate(undefined);
    setAssignedToId("");
  };

  const handleSubmit = () => {
    if (!subject.trim()) return;
    const payload: Record<string, unknown> = {
      type,
      subject: subject.trim(),
      ...scope,
    };
    if (description.trim()) payload.description = description.trim();
    if (dueDate) payload.dueDate = dueDate.toISOString();
    if (assignedToId) payload.assignedToId = assignedToId;
    createMutation.mutate(payload, {
      onSuccess: () => {
        setOpen(false);
        resetForm();
      },
    });
  };

  return (
    <Card>
      <div className="flex items-center justify-between">
        <CardTitle>Activities</CardTitle>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="mr-1 size-4" /> Log activity
        </Button>
      </div>

      <div className="mt-4 space-y-3">
        {query.isLoading ? (
          <p className="text-sm text-slate-400">Loading...</p>
        ) : activities.length === 0 ? (
          <p className="text-sm text-slate-400">No activities yet</p>
        ) : (
          activities.map((a) => <ActivityRow key={a.id} activity={a} />)
        )}
      </div>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Log Activity</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Type" required>
                <Select value={type} onValueChange={setType} options={typeOptions} />
              </FormField>
              <FormField label="Assigned To">
                <Select
                  value={assignedToId}
                  onValueChange={setAssignedToId}
                  placeholder="Unassigned"
                  options={users.map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName}` }))}
                />
              </FormField>
            </div>

            <FormField label="Subject" required>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Call with client about pricing" />
            </FormField>

            <FormField label="Description">
              <TextArea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Notes..." />
            </FormField>

            <FormField label="Due Date">
              <DatePicker value={dueDate} onChange={(d) => setDueDate(d ?? undefined)} />
            </FormField>
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!subject.trim() || createMutation.isPending}>
              {createMutation.isPending ? "Saving..." : "Log"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ActivityRow({ activity }: { activity: Activity }) {
  const Icon = typeIcon[activity.type] ?? StickyNote;
  const updateMutation = useUpdateActivity(activity.id);
  const completed = !!activity.completedAt;
  const creator = activity.createdBy ? `${activity.createdBy.firstName ?? ""} ${activity.createdBy.lastName ?? ""}`.trim() : "";

  const handleToggle = () => {
    updateMutation.mutate({ completedAt: completed ? null : new Date().toISOString() });
  };

  return (
    <div className="flex gap-3 rounded-xl border border-border/50 p-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className={`font-medium text-sm ${completed ? "line-through text-slate-400" : ""}`}>{activity.subject}</div>
            {activity.description && (
              <p className="mt-0.5 text-xs text-slate-500">{activity.description}</p>
            )}
            <div className="mt-1 text-[11px] text-slate-400">
              {creator && <>{creator} · </>}
              {relativeTime(activity.createdAt)}
              {activity.dueDate && <> · due {new Date(activity.dueDate).toLocaleDateString()}</>}
            </div>
          </div>
          <button
            type="button"
            onClick={handleToggle}
            title={completed ? "Mark incomplete" : "Mark complete"}
            className={`flex size-6 shrink-0 items-center justify-center rounded-md border transition ${
              completed ? "border-emerald-500 bg-emerald-500 text-white" : "border-border text-transparent hover:text-slate-400"
            }`}
          >
            <Check className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
