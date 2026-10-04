"use client";

import { useMemo, useState, useEffect } from "react";
import { CalendarRange, CheckSquare2, ChevronUp, Plus, Rocket, Search } from "lucide-react";
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
  useProductIdeas,
  type ProductIdeaRow,
  type ProductIdeaStatus,
} from "@/lib/api/hooks";
import { useCreateProductIdea, useToggleProductIdeaVote } from "@/lib/api/mutations";
import { useAuthStore } from "@/lib/store/auth-store";
import { PRODUCT_STATUSES, getInitials } from "@/components/studio/studio-utils";
import { ProductIdeaDetail } from "@/components/studio/product-idea-detail";

export default function ProductIdeasPage() {
  const me = useAuthStore((s) => s.user);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProductIdeaStatus | "">("");
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<ProductIdeaRow | null>(null);

  const debounced = useDebounced(search, 250);
  const ideasQuery = useProductIdeas({ search: debounced, status: statusFilter });
  const ideas = ideasQuery.data ?? [];
  const toggleVote = useToggleProductIdeaVote();

  const refreshedSelected = useMemo(() => {
    if (!selected) return null;
    return ideas.find((i) => i.id === selected.id) ?? selected;
  }, [ideas, selected]);

  const grouped = useMemo(() => {
    const map: Record<ProductIdeaStatus, ProductIdeaRow[]> = {
      IDEA: [], VALIDATING: [], PLANNED: [], BUILDING: [], SHIPPED: [], REJECTED: [],
    };
    for (const i of ideas) map[i.status].push(i);
    return map;
  }, [ideas]);

  const counts = [
    { label: "Total", value: ideas.length, tone: "neutral" as const },
    { label: "Building", value: grouped.BUILDING.length, tone: "warning" as const },
    { label: "Shipped", value: grouped.SHIPPED.length, tone: "positive" as const },
    { label: "Validating", value: grouped.VALIDATING.length, tone: "info" as const },
  ];

  return (
    <ListPageLayout
      module="ideas"
      title="Product ideas"
      description="Capture, vote on, and ship the things you want to build next. Every idea earns its place by stating the problem and the metric."
      counts={counts}
      primaryAction={{
        label: "New idea",
        icon: <Plus className="size-4" />,
        onClick: () => setCreateOpen(true),
      }}
    >
      {/* Thinner toolbar — no card wrapper, just a row */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, description, or rationale…"
            className="h-9 pl-10 text-sm"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as ProductIdeaStatus | "")}
          options={[
            { value: "", label: "All statuses" },
            ...PRODUCT_STATUSES.map((s) => ({ value: s.key, label: s.label })),
          ]}
          size="sm"
          className="w-full sm:w-44"
        />
      </div>

      <div className="flex gap-2.5 overflow-x-auto pb-4">
        {PRODUCT_STATUSES.map((s) => {
          const rows = grouped[s.key];
          return (
            <div key={s.key} className="w-60 shrink-0 sm:w-64">
              <div className="mb-2 flex items-center justify-between px-1">
                <div className="flex items-center gap-1.5">
                  <span className={cn("size-2 rounded-full", s.accent)} />
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{s.label}</h3>
                  <span className="rounded-full bg-slate-100 px-1.5 py-0 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">{rows.length}</span>
                </div>
              </div>
              <div className="flex max-h-[calc(100vh-260px)] flex-col gap-1.5 overflow-y-auto rounded-xl bg-slate-50/60 p-1.5 dark:bg-slate-900/30">
                {rows.map((idea) => (
                  <IdeaCard
                    key={idea.id}
                    idea={idea}
                    currentUserId={me?.id ?? null}
                    onOpen={() => setSelected(idea)}
                    onVote={() => toggleVote.mutate(idea.id)}
                  />
                ))}
                {/* Always-on "add" affordance — gentle when the column already
                    has items, prominent when it's empty. */}
                <button
                  onClick={() => setCreateOpen(true)}
                  className={cn(
                    "flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed text-[11px] font-medium transition",
                    rows.length === 0
                      ? "border-slate-200 px-3 py-5 text-slate-400 hover:border-slate-300 hover:bg-white hover:text-slate-600 dark:border-slate-700 dark:hover:bg-slate-950"
                      : "border-transparent px-2 py-1.5 text-slate-300 opacity-0 hover:border-slate-200 hover:text-slate-500 group-hover:opacity-100 dark:hover:border-slate-700",
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
      <ProductIdeaDetail
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        idea={refreshedSelected}
      />
    </ListPageLayout>
  );
}

function IdeaCard({
  idea,
  currentUserId,
  onOpen,
  onVote,
}: {
  idea: ProductIdeaRow;
  currentUserId: string | null;
  onOpen: () => void;
  onVote: () => void;
}) {
  const hasVoted = !!idea.votes?.some((v) => v.userId === currentUserId);
  const completed = idea.tasks.filter((t) => t.completed).length;
  // Skip showing the rationale block when it just repeats the title (common
  // for one-line ideas) — keeps the card tight instead of doubling the row.
  const showRationale =
    !!idea.rationale && idea.rationale.trim().toLowerCase() !== idea.title.trim().toLowerCase();
  const hasMetaRow = idea._count.tasks > 0 || !!idea.targetDate || !!idea.tags.length;

  return (
    <div
      onClick={onOpen}
      className="group cursor-pointer rounded-lg border border-border bg-white p-2.5 transition hover:border-slate-300 hover:shadow-sm dark:bg-slate-950"
    >
      <div className="flex items-start gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); onVote(); }}
          className={cn(
            "flex size-8 shrink-0 flex-col items-center justify-center rounded-md text-[10px] font-bold transition",
            hasVoted
              ? "bg-violet-500 text-white"
              : "border border-border bg-white hover:border-violet-300 hover:bg-violet-50 dark:bg-slate-950 dark:hover:bg-violet-950/30",
          )}
        >
          <ChevronUp className={cn("size-3", hasVoted ? "" : "text-slate-400")} />
          <span className="leading-none">{idea.voteCount}</span>
        </button>
        <div className="min-w-0 flex-1">
          <h4 className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900 dark:text-white">{idea.title}</h4>
          {showRationale && (
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-500">{idea.rationale}</p>
          )}
        </div>
      </div>
      {hasMetaRow && (
        <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400">
          <div className="flex items-center gap-2">
            {idea._count.tasks > 0 && (
              <span className="inline-flex items-center gap-1">
                <CheckSquare2 className="size-3" /> {completed}/{idea._count.tasks}
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
    </div>
  );
}

function NewIdeaDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateProductIdea();
  const [title, setTitle] = useState("");
  const [rationale, setRationale] = useState("");
  const [successMetric, setSuccessMetric] = useState("");

  const submit = async () => {
    if (!title.trim()) return;
    await create.mutateAsync({
      title: title.trim(),
      rationale: rationale.trim() || undefined,
      successMetric: successMetric.trim() || undefined,
    });
    setTitle("");
    setRationale("");
    setSuccessMetric("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>New product idea</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <FormField label="Title">
            <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. AI brief assistant for proposals" />
          </FormField>
          <FormField label="Why it matters (rationale)">
            <TextArea
              rows={3}
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="The customer problem this solves, or the business case for building it."
            />
          </FormField>
          <FormField label="Success metric — optional">
            <Input value={successMetric} onChange={(e) => setSuccessMetric(e.target.value)} placeholder="e.g. cut proposal turnaround time by 40%" />
          </FormField>
          <p className="flex items-center gap-1.5 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-900/60">
            <Rocket className="size-3.5" /> The idea will start in the <strong>Idea</strong> column. Teammates can upvote it; you can move it forward as it earns traction.
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

function useDebounced<T>(value: T, delay: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}
