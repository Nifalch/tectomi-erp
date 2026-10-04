"use client";

import { useMemo, useState } from "react";
import { CalendarRange, CheckSquare2, MessageSquare, Newspaper, Plus, Search } from "lucide-react";
import { ListPageLayout } from "@/components/layouts/list-page-layout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogTitle, DialogHeader, DialogFooter } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form";
import { TextArea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  useMarketingIdeas,
  type MarketingIdeaRow,
  type MarketingIdeaStage,
} from "@/lib/api/hooks";
import { useCreateMarketingIdea } from "@/lib/api/mutations";
import { MARKETING_STAGES, MARKETING_PRIORITY_META, getInitials } from "@/components/studio/studio-utils";
import { MarketingDetail } from "@/components/studio/marketing-detail";

export default function MarketingPage() {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<MarketingIdeaStage | "">("");
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<MarketingIdeaRow | null>(null);

  const debounced = useDebounced(search, 250);
  const ideasQuery = useMarketingIdeas({ search: debounced, stage: stageFilter });
  const ideas = ideasQuery.data ?? [];

  // Re-hydrate the open drawer with fresh data after a mutation.
  const refreshedSelected = useMemo(() => {
    if (!selected) return null;
    return ideas.find((i) => i.id === selected.id) ?? selected;
  }, [ideas, selected]);

  const grouped = useMemo(() => {
    const byStage: Record<MarketingIdeaStage, MarketingIdeaRow[]> = {
      IDEA: [], PLANNED: [], IN_PROGRESS: [], REVIEW: [], LIVE: [], DONE: [], CANCELLED: [],
    };
    for (const i of ideas) byStage[i.stage].push(i);
    return byStage;
  }, [ideas]);

  const counts = [
    { label: "Total", value: ideas.length, tone: "neutral" as const },
    { label: "In progress", value: grouped.IN_PROGRESS.length, tone: "warning" as const },
    { label: "Live", value: grouped.LIVE.length, tone: "positive" as const },
    { label: "Awaiting review", value: grouped.REVIEW.length, tone: "info" as const },
  ];

  return (
    <ListPageLayout
      module="marketing"
      title="Marketing planner"
      description="Capture ideas, draft content, and walk every campaign from idea to live without losing context."
      counts={counts}
      primaryAction={{
        label: "New idea",
        icon: <Plus className="size-4" />,
        onClick: () => setCreateOpen(true),
      }}
    >
      {/* Thinner toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ideas, copy, or briefs…"
            className="h-9 pl-10 text-sm"
          />
        </div>
        <Select
          value={stageFilter}
          onValueChange={(v) => setStageFilter(v as MarketingIdeaStage | "")}
          options={[
            { value: "", label: "All stages" },
            ...MARKETING_STAGES.map((s) => ({ value: s.key, label: s.label })),
          ]}
          size="sm"
          className="w-full sm:w-44"
        />
      </div>

      {/* Kanban */}
      <div className="flex gap-2.5 overflow-x-auto pb-4">
        {MARKETING_STAGES.map((s) => {
          const rows = grouped[s.key];
          return (
            <div key={s.key} className="w-60 shrink-0 sm:w-64">
              <div className="mb-2 flex items-center justify-between px-1">
                <div className="flex items-center gap-1.5">
                  <span className={cn("size-2 rounded-full", s.accent)} />
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                    {s.label}
                  </h3>
                  <span className="rounded-full bg-slate-100 px-1.5 py-0 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    {rows.length}
                  </span>
                </div>
              </div>
              <div className="flex max-h-[calc(100vh-260px)] flex-col gap-1.5 overflow-y-auto rounded-xl bg-slate-50/60 p-1.5 dark:bg-slate-900/30">
                {rows.map((idea) => <MarketingCard key={idea.id} idea={idea} onClick={() => setSelected(idea)} />)}
                <button
                  onClick={() => setCreateOpen(true)}
                  className={cn(
                    "flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed text-[11px] font-medium transition",
                    rows.length === 0
                      ? "border-slate-200 px-3 py-5 text-slate-400 hover:border-slate-300 hover:bg-white hover:text-slate-600 dark:border-slate-700 dark:hover:bg-slate-950"
                      : "border-transparent px-2 py-1.5 text-slate-300 hover:border-slate-200 hover:text-slate-500 dark:hover:border-slate-700",
                  )}
                >
                  <Plus className="size-3.5" />
                  Add idea
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <NewIdeaDialog open={createOpen} onOpenChange={setCreateOpen} />
      <MarketingDetail
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        idea={refreshedSelected}
      />
    </ListPageLayout>
  );
}

function MarketingCard({ idea, onClick }: { idea: MarketingIdeaRow; onClick: () => void }) {
  const priority = MARKETING_PRIORITY_META[idea.priority];
  const completed = idea.tasks.filter((t) => t.completed).length;
  // Skip the description block when it just repeats the title.
  const showDescription =
    !!idea.description &&
    idea.description.trim().toLowerCase() !== idea.title.trim().toLowerCase();
  const hasMetaRow =
    idea._count.tasks > 0 || idea._count.socialPosts > 0 || !!idea.targetDate || !!idea.tags.length;
  return (
    <button
      onClick={onClick}
      className="group flex w-full flex-col gap-1 rounded-lg border border-border bg-white p-2.5 text-left transition hover:border-slate-300 hover:shadow-sm dark:bg-slate-950"
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900 dark:text-white">{idea.title}</h4>
        <span
          className={cn("shrink-0 rounded-full px-1.5 py-0 text-[10px] font-bold", priority.chip)}
          title={`${priority.label} priority`}
        >
          {priority.label[0]}
        </span>
      </div>
      {showDescription && (
        <p className="line-clamp-2 text-[11px] leading-snug text-slate-500">{idea.description}</p>
      )}
      {hasMetaRow && (
        <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
          <div className="flex items-center gap-2">
            {idea._count.tasks > 0 && (
              <span className="inline-flex items-center gap-1">
                <CheckSquare2 className="size-3" /> {completed}/{idea._count.tasks}
              </span>
            )}
            {idea._count.socialPosts > 0 && (
              <span className="inline-flex items-center gap-1">
                <MessageSquare className="size-3" /> {idea._count.socialPosts}
              </span>
            )}
            {idea.targetDate && (
              <span className="inline-flex items-center gap-1">
                <CalendarRange className="size-3" />
                {new Date(idea.targetDate).toLocaleDateString(undefined, { day: "2-digit", month: "short" })}
              </span>
            )}
            {idea.tags.slice(0, 2).map((t) => (
              <span key={t} className="rounded-full bg-slate-100 px-1.5 py-0 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                #{t}
              </span>
            ))}
          </div>
          <Avatar initials={getInitials(idea.owner)} className="size-5 text-[9px]" />
        </div>
      )}
    </button>
  );
}

function NewIdeaDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateMarketingIdea();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const submit = async () => {
    if (!title.trim()) return;
    await create.mutateAsync({
      title: title.trim(),
      description: description.trim() || undefined,
    });
    setTitle("");
    setDescription("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>New marketing idea</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <FormField label="Title">
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Diwali product launch campaign"
            />
          </FormField>
          <FormField label="Brief">
            <TextArea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="One-line goal or angle — you can flesh out the copy after."
            />
          </FormField>
          <p className="flex items-center gap-1.5 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-900/60">
            <Newspaper className="size-3.5" /> The idea will start in the <strong>Idea</strong> column. You can move it as the team plans, drafts, and ships.
          </p>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending}>Create idea</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Local debounce — keeps the network quiet during fast typing.
import { useEffect } from "react";
function useDebounced<T>(value: T, delay: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}
