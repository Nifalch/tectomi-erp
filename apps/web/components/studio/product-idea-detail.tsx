"use client";

import { useState } from "react";
import { Check, ChevronUp, GripVertical, Loader2, Plus, Trash2 } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Avatar } from "@/components/ui/avatar";
import {
  useProductIdea,
  type ProductIdeaRow,
  type ProductIdeaStatus,
} from "@/lib/api/hooks";
import {
  useAddProductIdeaTask,
  useDeleteProductIdea,
  useDeleteProductIdeaTask,
  useToggleProductIdeaVote,
  useUpdateProductIdea,
  useUpdateProductIdeaTask,
} from "@/lib/api/mutations";
import { useAuthStore } from "@/lib/store/auth-store";
import { cn } from "@/lib/utils";
import { PRODUCT_STATUS_OPTIONS, PRODUCT_STATUSES, getInitials, timeAgo } from "./studio-utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  idea: ProductIdeaRow | null;
}

export function ProductIdeaDetail({ open, onOpenChange, idea }: Props) {
  const me = useAuthStore((s) => s.user);
  const detail = useProductIdea(open ? idea?.id ?? null : null);
  const data = detail.data ?? idea;
  const update = useUpdateProductIdea(idea?.id ?? "");
  const remove = useDeleteProductIdea();
  const toggleVote = useToggleProductIdeaVote();
  const addTask = useAddProductIdeaTask(idea?.id ?? "");
  const updateTask = useUpdateProductIdeaTask();
  const deleteTask = useDeleteProductIdeaTask();

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!idea || !data) return null;
  const status = PRODUCT_STATUSES.find((s) => s.key === data.status)!;
  const hasVoted = !!data.votes?.some((v) => v.userId === me?.id);

  const handleDelete = async () => {
    await remove.mutateAsync(idea.id);
    setConfirmDelete(false);
    onOpenChange(false);
  };

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        size="xl"
        title={data.title}
        description={data.description ?? "Product idea"}
      >
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr,280px]">
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ring-1", status.chip)}>
                <span className={cn("size-1.5 rounded-full", status.accent)} />
                {status.label}
              </span>
              <button
                onClick={() => toggleVote.mutate(idea.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition",
                  hasVoted
                    ? "bg-violet-500 text-white"
                    : "border border-border bg-white text-slate-600 hover:border-slate-300 dark:bg-slate-950 dark:text-slate-300",
                )}
              >
                <ChevronUp className="size-3.5" />
                {data.voteCount}
              </button>
              {data.tags.map((t) => (
                <span key={t} className="rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700">
                  #{t}
                </span>
              ))}
            </div>

            <FormField label="Description">
              <TextArea
                rows={4}
                defaultValue={data.description ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (data.description ?? "")) {
                    update.mutate({ description: e.target.value });
                  }
                }}
                placeholder="What is this idea?"
              />
            </FormField>

            <FormField label="Why it matters (rationale)">
              <TextArea
                rows={3}
                defaultValue={data.rationale ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (data.rationale ?? "")) {
                    update.mutate({ rationale: e.target.value });
                  }
                }}
                placeholder="The customer problem or business case behind this idea."
              />
            </FormField>

            <FormField label="Success metric — how we'd know it worked">
              <Input
                defaultValue={data.successMetric ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (data.successMetric ?? "")) {
                    update.mutate({ successMetric: e.target.value });
                  }
                }}
                placeholder="e.g. 20% lift in trial-to-paid conversion"
              />
            </FormField>

            {/* Checklist */}
            <section>
              <header className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Next steps</h4>
                {data.tasks.length > 0 && (
                  <span className="text-xs text-slate-500">
                    {data.tasks.filter((t) => t.completed).length} of {data.tasks.length} done
                  </span>
                )}
              </header>
              <div className="space-y-1.5">
                {data.tasks.map((t) => (
                  <div key={t.id} className={cn("group flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 dark:bg-slate-950", t.completed && "opacity-60")}>
                    <GripVertical className="size-3.5 cursor-grab text-slate-300" />
                    <button
                      onClick={() => updateTask.mutate({ taskId: t.id, data: { completed: !t.completed } })}
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-md border transition",
                        t.completed ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 hover:border-slate-400 dark:border-slate-600",
                      )}
                    >
                      {t.completed && <Check className="size-3" />}
                    </button>
                    <span className={cn("min-w-0 flex-1 truncate text-sm", t.completed ? "text-slate-400 line-through" : "text-slate-900 dark:text-white")}>{t.title}</span>
                    {t.assignedTo && <Avatar initials={getInitials(t.assignedTo)} className="size-6 text-[10px]" />}
                    {t.dueDate && (
                      <span className="text-[11px] text-slate-400">
                        {new Date(t.dueDate).toLocaleDateString(undefined, { day: "2-digit", month: "short" })}
                      </span>
                    )}
                    <button
                      onClick={() => deleteTask.mutate(t.id)}
                      className="rounded-md p-1 text-slate-300 opacity-0 transition hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 dark:hover:bg-red-950/30"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <Input
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newTaskTitle.trim()) {
                        addTask.mutate({ title: newTaskTitle.trim() });
                        setNewTaskTitle("");
                      }
                    }}
                    placeholder="Add a next step…"
                    className="text-sm"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      if (newTaskTitle.trim()) {
                        addTask.mutate({ title: newTaskTitle.trim() });
                        setNewTaskTitle("");
                      }
                    }}
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>
              </div>
            </section>
          </div>

          <aside className="space-y-4">
            <FormField label="Status">
              <Select
                value={data.status}
                onValueChange={(v) => update.mutate({ status: v as ProductIdeaStatus })}
                options={PRODUCT_STATUS_OPTIONS}
                size="sm"
              />
            </FormField>
            <FormField label="Target date">
              <Input
                type="date"
                value={data.targetDate ? data.targetDate.slice(0, 10) : ""}
                onChange={(e) => update.mutate({ targetDate: e.target.value ? new Date(e.target.value).toISOString() : null })}
              />
            </FormField>
            <FormField label="Title">
              <Input
                defaultValue={data.title}
                onBlur={(e) => {
                  if (e.target.value.trim() && e.target.value !== data.title) {
                    update.mutate({ title: e.target.value.trim() });
                  }
                }}
              />
            </FormField>
            <div className="rounded-xl border border-border p-3 text-xs text-slate-500 dark:bg-slate-950">
              <div className="mb-1.5 flex items-center gap-2">
                <Avatar initials={getInitials(data.owner)} className="size-6 text-[10px]" />
                <span className="text-slate-700 dark:text-slate-200">
                  {data.owner.firstName} {data.owner.lastName}
                </span>
              </div>
              <div>Posted {timeAgo(data.createdAt)} · Updated {timeAgo(data.updatedAt)}</div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="mr-1.5 size-4" /> Delete idea
            </Button>
            {update.isPending && (
              <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
                <Loader2 className="size-3 animate-spin" /> Saving…
              </div>
            )}
          </aside>
        </div>
      </Drawer>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete "${idea.title}"?`}
        description="Tasks and votes will be removed."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
        loading={remove.isPending}
      />
    </>
  );
}
