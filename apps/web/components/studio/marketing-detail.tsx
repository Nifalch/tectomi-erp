"use client";

import { useEffect, useState } from "react";
import { CalendarRange, Check, GripVertical, Loader2, Plus, Trash2 } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Avatar } from "@/components/ui/avatar";
import {
  useMarketingIdea,
  type MarketingIdeaPriority,
  type MarketingIdeaRow,
  type MarketingIdeaStage,
} from "@/lib/api/hooks";
import {
  useAddMarketingIdeaTask,
  useDeleteMarketingIdea,
  useDeleteMarketingIdeaTask,
  useUpdateMarketingIdea,
  useUpdateMarketingIdeaTask,
} from "@/lib/api/mutations";
import { cn } from "@/lib/utils";
import {
  MARKETING_PRIORITY_META,
  MARKETING_STAGES,
  MARKETING_STAGE_OPTIONS,
  getInitials,
  timeAgo,
} from "./studio-utils";
import { SOCIAL_PLATFORM_META } from "./studio-utils";
import type { SocialPlatform, SocialPostStatus } from "@/lib/api/hooks";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  idea: MarketingIdeaRow | null;
}

export function MarketingDetail({ open, onOpenChange, idea }: Props) {
  // Hydrate the freshest record (with social posts) when the drawer opens.
  const detail = useMarketingIdea(open ? idea?.id ?? null : null);
  const data = detail.data ?? idea;
  const update = useUpdateMarketingIdea(idea?.id ?? "");
  const remove = useDeleteMarketingIdea();
  const addTask = useAddMarketingIdeaTask(idea?.id ?? "");
  const updateTask = useUpdateMarketingIdeaTask();
  const deleteTask = useDeleteMarketingIdeaTask();

  const [content, setContent] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open && data) setContent(data.content ?? "");
  }, [open, data?.id]);

  if (!idea || !data) return null;

  const stage = MARKETING_STAGES.find((s) => s.key === data.stage)!;
  const priority = MARKETING_PRIORITY_META[data.priority];

  const handleSaveContent = () => {
    if (content === (data.content ?? "")) return;
    update.mutate({ content });
  };

  const handleDelete = async () => {
    await remove.mutateAsync(idea.id);
    setConfirmDelete(false);
    onOpenChange(false);
  };

  const completedCount = data.tasks.filter((t) => t.completed).length;
  const totalCount = data.tasks.length;

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        size="xl"
        title={data.title}
        description={data.description ?? "Marketing initiative"}
      >
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr,280px]">
          {/* Main column */}
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ring-1", stage.chip)}>
                <span className={cn("size-1.5 rounded-full", stage.accent)} />
                {stage.label}
              </span>
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", priority.chip)}>
                {priority.label} priority
              </span>
              {data.targetDate && (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  <CalendarRange className="size-3" />
                  Target {new Date(data.targetDate).toLocaleDateString(undefined, { day: "2-digit", month: "short" })}
                </span>
              )}
              {data.tags.map((t) => (
                <span key={t} className="rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700">
                  #{t}
                </span>
              ))}
            </div>

            <FormField label="Content / copy">
              <TextArea
                rows={12}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onBlur={handleSaveContent}
                placeholder="Draft the campaign copy, message, or content here. Saved when you click out of the field."
                className="font-sans text-sm leading-relaxed"
              />
            </FormField>

            {/* Checklist */}
            <section>
              <header className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Tasks</h4>
                {totalCount > 0 && (
                  <span className="text-xs text-slate-500">
                    {completedCount} of {totalCount} done
                  </span>
                )}
              </header>
              <div className="space-y-1.5">
                {data.tasks.map((t) => (
                  <div
                    key={t.id}
                    className={cn(
                      "group flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 dark:bg-slate-950",
                      t.completed && "opacity-60",
                    )}
                  >
                    <GripVertical className="size-3.5 cursor-grab text-slate-300" />
                    <button
                      onClick={() => updateTask.mutate({ taskId: t.id, data: { completed: !t.completed } })}
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-md border transition",
                        t.completed
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-slate-300 hover:border-slate-400 dark:border-slate-600",
                      )}
                    >
                      {t.completed && <Check className="size-3" />}
                    </button>
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-sm",
                        t.completed ? "text-slate-400 line-through" : "text-slate-900 dark:text-white",
                      )}
                    >
                      {t.title}
                    </span>
                    {t.assignedTo && (
                      <Avatar initials={getInitials(t.assignedTo)} className="size-6 text-[10px]" />
                    )}
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
                {/* Inline add */}
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
                    placeholder="Add a task and press Enter…"
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

            {/* Linked social posts */}
            {detail.data?.socialPosts && detail.data.socialPosts.length > 0 && (
              <section>
                <h4 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Linked social posts</h4>
                <div className="space-y-2">
                  {detail.data.socialPosts.map((p) => {
                    const meta = SOCIAL_PLATFORM_META[p.platform as SocialPlatform];
                    const Icon = meta.icon;
                    return (
                      <div key={p.id} className="flex items-center gap-3 rounded-xl border border-border bg-white p-3 dark:bg-slate-950">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: meta.hex + "1a", color: meta.hex }}>
                          <Icon className="size-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-slate-900 dark:text-white">
                            {p.title || p.content.slice(0, 80)}
                          </div>
                          <div className="text-xs text-slate-500">
                            {(p.status as SocialPostStatus) === "PUBLISHED"
                              ? `Published ${timeAgo(p.publishedAt)}`
                              : p.scheduledAt
                                ? `Scheduled for ${new Date(p.scheduledAt).toLocaleString()}`
                                : "Draft"}
                          </div>
                        </div>
                        {p.link && (
                          <a href={p.link} target="_blank" rel="noreferrer" className="text-xs font-medium text-primary hover:underline">
                            Open
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>

          {/* Sidebar */}
          <aside className="space-y-4">
            <FormField label="Stage">
              <Select
                value={data.stage}
                onValueChange={(v) => update.mutate({ stage: v as MarketingIdeaStage })}
                options={MARKETING_STAGE_OPTIONS}
                size="sm"
              />
            </FormField>
            <FormField label="Priority">
              <Select
                value={data.priority}
                onValueChange={(v) => update.mutate({ priority: v as MarketingIdeaPriority })}
                options={[
                  { value: "LOW", label: "Low" },
                  { value: "MEDIUM", label: "Medium" },
                  { value: "HIGH", label: "High" },
                ]}
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
            <FormField label="Description">
              <TextArea
                rows={3}
                defaultValue={data.description ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (data.description ?? "")) {
                    update.mutate({ description: e.target.value });
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
              <div>Created {timeAgo(data.createdAt)} · Updated {timeAgo(data.updatedAt)}</div>
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
        description="Tasks and the linked social post connections will be removed."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
        loading={remove.isPending}
      />
    </>
  );
}
