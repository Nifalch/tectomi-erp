"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Globe, Pencil, Pin, PinOff, Plus, Search, Sparkles, Trash2, Wand2 } from "lucide-react";
import { ListPageLayout } from "@/components/layouts/list-page-layout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogHeader, DialogFooter } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form";
import { TextArea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  useTeamTools,
  type TeamToolCategory,
  type TeamToolRow,
} from "@/lib/api/hooks";
import {
  useCreateTeamTool,
  useDeleteTeamTool,
  useSeedTeamTools,
  useToggleTeamToolPin,
  useUpdateTeamTool,
} from "@/lib/api/mutations";
import { TEAM_TOOL_CATEGORIES, TEAM_TOOL_CATEGORY_OPTIONS, faviconFor } from "@/components/studio/studio-utils";

export default function ToolsPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<TeamToolCategory | "">("");
  const [aiOnly, setAiOnly] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<TeamToolRow | null>(null);

  const debounced = useDebounced(search, 250);
  const toolsQuery = useTeamTools({
    search: debounced,
    category,
    ...(aiOnly ? { isAi: true } : {}),
  });
  const tools = toolsQuery.data ?? [];
  const seed = useSeedTeamTools();

  const pinned = tools.filter((t) => t.isPinned);
  const rest = tools.filter((t) => !t.isPinned);

  const counts = [
    { label: "Total", value: tools.length, tone: "neutral" as const },
    { label: "Pinned", value: pinned.length, tone: "info" as const },
    { label: "AI", value: tools.filter((t) => t.isAi).length, tone: "positive" as const },
  ];

  return (
    <ListPageLayout
      module="tools"
      title="Team tools"
      description="Curated directory of the apps and AI tools the team uses every day. Pin your favorites and add new ones in seconds."
      counts={counts}
      primaryAction={{
        label: "Add tool",
        icon: <Plus className="size-4" />,
        onClick: () => {
          setEditing(null);
          setEditorOpen(true);
        },
      }}
      secondaryActions={[
        {
          label: seed.isPending ? "Seeding…" : "Top up catalog",
          icon: <Sparkles className="size-4" />,
          onClick: () => seed.mutate(),
        },
      ]}
    >
      <Card className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tools, descriptions, or URLs…"
              className="pl-10"
            />
          </div>
          <Select
            value={category}
            onValueChange={(v) => setCategory(v as TeamToolCategory | "")}
            options={[{ value: "", label: "All categories" }, ...TEAM_TOOL_CATEGORY_OPTIONS]}
            size="sm"
            className="w-full sm:w-44"
          />
          <button
            onClick={() => setAiOnly((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition",
              aiOnly
                ? "bg-violet-500 text-white"
                : "border border-border bg-white text-slate-600 hover:border-slate-300 dark:bg-slate-950 dark:text-slate-300",
            )}
          >
            <Sparkles className="size-3.5" /> AI only
          </button>
        </div>

        {/* Category chips */}
        <div className="flex flex-wrap gap-1.5 border-t border-border/60 pt-3">
          <button
            onClick={() => setCategory("")}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium transition",
              category === ""
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300",
            )}
          >
            All
          </button>
          {TEAM_TOOL_CATEGORIES.map((c) => (
            <button
              key={c.key}
              onClick={() => setCategory(c.key)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium transition",
                category === c.key
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </Card>

      {/* Empty state with seed CTA */}
      {tools.length === 0 ? (
        <Card className="space-y-3 py-10 text-center">
          <Wand2 className="mx-auto size-10 text-slate-300" />
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">Your directory is empty</h3>
          <p className="mx-auto max-w-md text-sm text-slate-500">
            Add your own tools, or seed the directory with a starter set of popular AI and team tools to get rolling.
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button onClick={() => seed.mutate()} disabled={seed.isPending}>
              <Sparkles className="mr-1.5 size-4" /> Seed starter catalog
            </Button>
            <Button variant="secondary" onClick={() => { setEditing(null); setEditorOpen(true); }}>
              <Plus className="mr-1.5 size-4" /> Add manually
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          {pinned.length > 0 && (
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <Pin className="size-3" /> Pinned
              </h3>
              <ToolGrid tools={pinned} onEdit={(t) => { setEditing(t); setEditorOpen(true); }} />
            </section>
          )}
          {rest.length > 0 && (
            <section>
              {pinned.length > 0 && (
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  All tools
                </h3>
              )}
              <ToolGrid tools={rest} onEdit={(t) => { setEditing(t); setEditorOpen(true); }} />
            </section>
          )}
        </div>
      )}

      <ToolEditorDialog
        open={editorOpen}
        onOpenChange={(o) => {
          setEditorOpen(o);
          if (!o) setEditing(null);
        }}
        tool={editing}
      />
    </ListPageLayout>
  );
}

function ToolGrid({ tools, onEdit }: { tools: TeamToolRow[]; onEdit: (t: TeamToolRow) => void }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {tools.map((t) => <ToolCard key={t.id} tool={t} onEdit={() => onEdit(t)} />)}
    </div>
  );
}

function ToolCard({ tool, onEdit }: { tool: TeamToolRow; onEdit: () => void }) {
  const pin = useToggleTeamToolPin();
  const remove = useDeleteTeamTool();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const icon = faviconFor(tool.url, tool.iconUrl);

  return (
    <>
      <div className="group relative flex flex-col gap-3 rounded-2xl border border-border bg-white p-4 transition hover:border-slate-300 hover:shadow-sm dark:bg-slate-950">
        <div className="flex items-start gap-3">
          {icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={icon}
              alt=""
              className="size-10 shrink-0 rounded-xl bg-slate-50 object-contain p-1 dark:bg-slate-900"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800">
              <Globe className="size-5" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h4 className="truncate text-sm font-semibold text-slate-900 dark:text-white">{tool.name}</h4>
              {tool.isAi && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-700 dark:bg-violet-500/20 dark:text-violet-200">
                  <Sparkles className="size-2.5" /> AI
                </span>
              )}
            </div>
            <div className="truncate text-[11px] text-slate-400">{safeHost(tool.url)}</div>
          </div>
          <button
            onClick={() => pin.mutate(tool.id)}
            className={cn(
              "rounded-md p-1 text-slate-300 transition hover:bg-slate-100 dark:hover:bg-slate-800",
              tool.isPinned && "text-amber-500",
            )}
            title={tool.isPinned ? "Unpin" : "Pin"}
          >
            {tool.isPinned ? <Pin className="size-4 fill-current" /> : <PinOff className="size-4" />}
          </button>
        </div>

        {tool.description && (
          <p className="line-clamp-2 text-xs text-slate-500">{tool.description}</p>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <a
            href={tool.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Open <ExternalLink className="size-3" />
          </a>
          <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
            <button
              onClick={onEdit}
              className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
              title="Edit"
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="rounded-md p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
              title="Delete"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Remove "${tool.name}" from the directory?`}
        description="This only removes it from the team directory. The external tool itself isn't affected."
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={async () => {
          await remove.mutateAsync(tool.id);
          setConfirmDelete(false);
        }}
        loading={remove.isPending}
      />
    </>
  );
}

function safeHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function ToolEditorDialog({
  open,
  onOpenChange,
  tool,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tool: TeamToolRow | null;
}) {
  const isEdit = !!tool;
  const create = useCreateTeamTool();
  const update = useUpdateTeamTool(tool?.id ?? "");

  const [form, setForm] = useState({
    name: "",
    description: "",
    url: "",
    category: "OTHER" as TeamToolCategory,
    isAi: false,
    isPinned: false,
  });

  useEffect(() => {
    if (open) {
      if (tool) {
        setForm({
          name: tool.name,
          description: tool.description ?? "",
          url: tool.url,
          category: tool.category,
          isAi: tool.isAi,
          isPinned: tool.isPinned,
        });
      } else {
        setForm({ name: "", description: "", url: "", category: "OTHER", isAi: false, isPinned: false });
      }
    }
  }, [open, tool]);

  const submit = async () => {
    if (!form.name.trim() || !form.url.trim()) return;
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      url: form.url.trim(),
      category: form.category,
      isAi: form.isAi,
      isPinned: form.isPinned,
    };
    if (isEdit) {
      await update.mutateAsync(payload);
    } else {
      await create.mutateAsync(payload);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit tool" : "Add tool"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <FormField label="Name">
            <Input
              autoFocus
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Claude"
            />
          </FormField>
          <FormField label="URL">
            <Input
              type="url"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://claude.ai"
            />
          </FormField>
          <FormField label="Description">
            <TextArea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What is this useful for?"
            />
          </FormField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Category">
              <Select
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v as TeamToolCategory })}
                options={TEAM_TOOL_CATEGORY_OPTIONS}
              />
            </FormField>
            <div className="space-y-2">
              <label className="flex items-center gap-2 rounded-xl border border-border p-2.5 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-violet-500"
                  checked={form.isAi}
                  onChange={(e) => setForm({ ...form, isAi: e.target.checked })}
                />
                <Sparkles className="size-3.5 text-violet-500" />
                <span className="text-slate-700 dark:text-slate-200">AI tool</span>
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-border p-2.5 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-amber-500"
                  checked={form.isPinned}
                  onChange={(e) => setForm({ ...form, isPinned: e.target.checked })}
                />
                <Pin className="size-3.5 text-amber-500" />
                <span className="text-slate-700 dark:text-slate-200">Pin to top</span>
              </label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim() || !form.url.trim() || create.isPending || update.isPending}>
            {isEdit ? "Save" : "Add tool"}
          </Button>
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
