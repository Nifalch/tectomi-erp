"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  FolderKanban,
  BriefcaseBusiness,
  Building2,
  Receipt,
  Users2,
  ArrowRight,
  Clock,
  Sparkles,
  CornerDownLeft,
  X,
  Hash,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type ResultType = "project" | "task" | "client" | "invoice" | "user";

interface SearchResult {
  type: ResultType;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}

const typeMeta: Record<ResultType, { icon: typeof FolderKanban; label: string; tone: string; chip: string }> = {
  project: {
    icon: FolderKanban,
    label: "Projects",
    tone: "text-violet-600 dark:text-violet-300",
    chip: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-200 dark:ring-violet-500/30",
  },
  task: {
    icon: BriefcaseBusiness,
    label: "Tasks",
    tone: "text-amber-600 dark:text-amber-300",
    chip: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/30",
  },
  client: {
    icon: Building2,
    label: "Clients",
    tone: "text-cyan-600 dark:text-cyan-300",
    chip: "bg-cyan-50 text-cyan-700 ring-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-200 dark:ring-cyan-500/30",
  },
  invoice: {
    icon: Receipt,
    label: "Invoices",
    tone: "text-emerald-600 dark:text-emerald-300",
    chip: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/30",
  },
  user: {
    icon: Users2,
    label: "People",
    tone: "text-pink-600 dark:text-pink-300",
    chip: "bg-pink-50 text-pink-700 ring-pink-200 dark:bg-pink-500/10 dark:text-pink-200 dark:ring-pink-500/30",
  },
};

const FILTERS: Array<{ key: "all" | ResultType; label: string }> = [
  { key: "all", label: "All" },
  { key: "project", label: "Projects" },
  { key: "task", label: "Tasks" },
  { key: "client", label: "Clients" },
];

const QUICK_NAV: Array<{ label: string; href: string; icon: typeof FolderKanban; hint: string }> = [
  { label: "Projects", href: "/projects", icon: FolderKanban, hint: "Browse all projects" },
  { label: "My Tasks", href: "/tasks", icon: BriefcaseBusiness, hint: "Your work queue" },
  { label: "Clients", href: "/clients", icon: Building2, hint: "Companies & contacts" },
  { label: "Invoices", href: "/invoices", icon: Receipt, hint: "Billing & payments" },
  { label: "Team", href: "/team", icon: Users2, hint: "Staff directory" },
];

const RECENT_KEY = "nuro7.search.recent";
const MAX_RECENT = 6;

function loadRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function persistRecent(value: string) {
  if (typeof window === "undefined") return;
  const trimmed = value.trim();
  if (!trimmed) return;
  try {
    const current = loadRecent().filter((v) => v.toLowerCase() !== trimmed.toLowerCase());
    const next = [trimmed, ...current].slice(0, MAX_RECENT);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // localStorage may be disabled; ignore.
  }
}

interface SearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SearchDialog({ open, onOpenChange }: SearchDialogProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [filter, setFilter] = useState<"all" | ResultType>("all");
  const [recent, setRecent] = useState<string[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);

    try {
      const [projects, tasks, clients] = await Promise.all([
        apiFetch<{ data: Array<{ id: string; name: string; client: { companyName: string } }> }>(
          `/projects?search=${encodeURIComponent(q)}`,
        ).catch(() => ({ data: [] })),
        apiFetch<{ data: Array<{ id: string; title: string; project: { name: string } }> }>(
          `/tasks?search=${encodeURIComponent(q)}`,
        ).catch(() => ({ data: [] })),
        apiFetch<{ data: Array<{ id: string; companyName: string; contactPerson: string }> }>(
          `/clients?search=${encodeURIComponent(q)}`,
        ).catch(() => ({ data: [] })),
      ]);

      const mapped: SearchResult[] = [
        ...(projects.data ?? []).map((p) => ({
          type: "project" as const,
          id: p.id,
          title: p.name,
          subtitle: p.client?.companyName,
          href: `/projects/${p.id}`,
        })),
        ...(tasks.data ?? []).map((t) => ({
          type: "task" as const,
          id: t.id,
          title: t.title,
          subtitle: t.project?.name,
          href: `/tasks`,
        })),
        ...(clients.data ?? []).map((c) => ({
          type: "client" as const,
          id: c.id,
          title: c.companyName,
          subtitle: c.contactPerson,
          href: `/clients`,
        })),
      ];

      setResults(mapped.slice(0, 24));
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search-on-type.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query) search(query);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, search]);

  // Reset state when dialog closes; refresh recent list on open.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setFilter("all");
      setActiveIndex(0);
    } else {
      setRecent(loadRecent());
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (filter === "all") return results;
    return results.filter((r) => r.type === filter);
  }, [results, filter]);

  const grouped = useMemo(() => {
    const groups: Partial<Record<ResultType, SearchResult[]>> = {};
    for (const r of filtered) {
      (groups[r.type] ??= []).push(r);
    }
    return groups;
  }, [filtered]);

  // Flat list mirroring visual order — used for arrow-key navigation.
  const flatList = useMemo(() => {
    const order: ResultType[] = ["project", "task", "client", "invoice", "user"];
    return order.flatMap((t) => grouped[t] ?? []);
  }, [grouped]);

  // Clamp the selected index whenever the visible list shrinks/grows.
  useEffect(() => {
    if (activeIndex >= flatList.length) setActiveIndex(0);
  }, [flatList.length, activeIndex]);

  const navigate = useCallback(
    (result: SearchResult) => {
      persistRecent(query || result.title);
      router.push(result.href);
      onOpenChange(false);
    },
    [query, router, onOpenChange],
  );

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, flatList.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = flatList[activeIndex];
      if (target) navigate(target);
    }
  };

  // Keep the active row scrolled into view as we move with the keyboard.
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const el = container.querySelector<HTMLButtonElement>(`[data-result-index="${activeIndex}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const clearRecent = () => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(RECENT_KEY);
      } catch {
        // ignore
      }
    }
    setRecent([]);
  };

  const showEmpty = query.length < 2;
  const showNoMatch = !showEmpty && !loading && filtered.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        className="overflow-hidden border-0 bg-white/95 p-0 shadow-[0_30px_120px_-20px_rgba(15,23,42,0.35)] backdrop-blur-xl dark:bg-slate-950/95 sm:rounded-3xl"
      >
        <DialogTitle className="sr-only">Global search</DialogTitle>

        {/* Search input — large, breathing, with subtle gradient frame.
            pr-14 leaves room for the Dialog's built-in close button (top-right). */}
        <div className="relative">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
          <div className="flex items-center gap-3 px-5 py-4 pr-14">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
              <Search className="size-4" />
            </div>
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleKey}
              placeholder="Search projects, tasks, clients, invoices..."
              className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-slate-400 dark:text-white"
              autoFocus
            />
            <div className="flex items-center gap-2">
              {loading && (
                <span className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span className="inline-block size-1.5 animate-pulse rounded-full bg-primary" />
                  Searching
                </span>
              )}
              {query && !loading && (
                <button
                  onClick={() => {
                    setQuery("");
                    setActiveIndex(0);
                  }}
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                  aria-label="Clear"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          </div>

          {/* Type filter chips — only show when a query is active */}
          {!showEmpty && (
            <div className="flex items-center gap-1.5 overflow-x-auto border-t border-border/60 px-5 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {FILTERS.map((f) => {
                const count = f.key === "all" ? results.length : results.filter((r) => r.type === f.key).length;
                const active = filter === f.key;
                return (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition",
                      active
                        ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700",
                    )}
                  >
                    {f.label}
                    {count > 0 && (
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-px text-[10px] font-semibold",
                          active
                            ? "bg-white/20 text-white dark:bg-slate-900/20 dark:text-slate-900"
                            : "bg-white text-slate-500 dark:bg-slate-900 dark:text-slate-400",
                        )}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Result list / empty state */}
        <div
          ref={listRef}
          className="max-h-[440px] min-h-[280px] overflow-y-auto border-t border-border/60 p-2"
        >
          {showEmpty ? (
            <EmptyState
              recent={recent}
              onUseRecent={(q) => {
                setQuery(q);
                setActiveIndex(0);
              }}
              onClearRecent={clearRecent}
              onNavigate={(href) => {
                router.push(href);
                onOpenChange(false);
              }}
            />
          ) : showNoMatch ? (
            <NoMatch query={query} />
          ) : (
            <ResultGroups
              grouped={grouped}
              flatList={flatList}
              activeIndex={activeIndex}
              onHover={setActiveIndex}
              onSelect={navigate}
            />
          )}
        </div>

        {/* Footer with keyboard hints */}
        <div className="flex items-center justify-between gap-3 border-t border-border/60 bg-slate-50/60 px-5 py-2.5 text-[11px] text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">
          <div className="flex items-center gap-3">
            <KbdHint label="Navigate">
              <kbd className="rounded border border-border bg-white px-1 font-mono text-[10px] dark:bg-slate-800">↑</kbd>
              <kbd className="rounded border border-border bg-white px-1 font-mono text-[10px] dark:bg-slate-800">↓</kbd>
            </KbdHint>
            <KbdHint label="Open">
              <kbd className="inline-flex items-center rounded border border-border bg-white px-1 font-mono text-[10px] dark:bg-slate-800">
                <CornerDownLeft className="size-3" />
              </kbd>
            </KbdHint>
            <KbdHint label="Close">
              <kbd className="rounded border border-border bg-white px-1 font-mono text-[10px] dark:bg-slate-800">ESC</kbd>
            </KbdHint>
          </div>
          <div className="hidden items-center gap-1.5 sm:flex">
            <Sparkles className="size-3 text-primary" />
            <span>Tectomi ERP search</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function KbdHint({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1">
      <span className="flex items-center gap-0.5">{children}</span>
      <span>{label}</span>
    </span>
  );
}

function EmptyState({
  recent,
  onUseRecent,
  onClearRecent,
  onNavigate,
}: {
  recent: string[];
  onUseRecent: (q: string) => void;
  onClearRecent: () => void;
  onNavigate: (href: string) => void;
}) {
  return (
    <div className="space-y-4 px-1 py-2">
      {recent.length > 0 && (
        <section>
          <header className="flex items-center justify-between px-2 pb-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              <Clock className="size-3" />
              Recent searches
            </div>
            <button
              onClick={onClearRecent}
              className="text-[11px] font-medium text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-200"
            >
              Clear
            </button>
          </header>
          <div className="flex flex-wrap gap-1.5 px-2 pb-1">
            {recent.map((r) => (
              <button
                key={r}
                onClick={() => onUseRecent(r)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-slate-50 px-3 py-1 text-xs text-slate-600 transition hover:border-slate-300 hover:bg-white dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Hash className="size-3 text-slate-400" />
                {r}
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <header className="flex items-center gap-1.5 px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          <Sparkles className="size-3" />
          Jump to
        </header>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {QUICK_NAV.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.href}
                onClick={() => onNavigate(item.href)}
                className="group flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition hover:border-border hover:bg-slate-50 dark:hover:bg-slate-900"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-100 to-slate-50 text-slate-600 transition group-hover:from-primary/10 group-hover:to-primary/5 group-hover:text-primary dark:from-slate-800 dark:to-slate-900 dark:text-slate-300">
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-900 dark:text-white">{item.label}</div>
                  <div className="truncate text-xs text-slate-500">{item.hint}</div>
                </div>
                <ArrowRight className="size-3.5 text-slate-300 opacity-0 transition group-hover:opacity-100" />
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function NoMatch({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
        <Search className="size-5" />
      </div>
      <div>
        <div className="text-sm font-medium text-slate-900 dark:text-white">
          No results for &ldquo;{query}&rdquo;
        </div>
        <div className="mt-1 text-xs text-slate-500">
          Try a different spelling or use the quick links to browse.
        </div>
      </div>
    </div>
  );
}

function ResultGroups({
  grouped,
  flatList,
  activeIndex,
  onHover,
  onSelect,
}: {
  grouped: Partial<Record<ResultType, SearchResult[]>>;
  flatList: SearchResult[];
  activeIndex: number;
  onHover: (i: number) => void;
  onSelect: (r: SearchResult) => void;
}) {
  const order: ResultType[] = ["project", "task", "client", "invoice", "user"];
  return (
    <div className="space-y-3 px-1 py-1">
      {order.map((type) => {
        const items = grouped[type];
        if (!items || items.length === 0) return null;
        const meta = typeMeta[type];
        const Icon = meta.icon;
        return (
          <section key={type}>
            <header className="flex items-center gap-2 px-2 pb-1.5">
              <Icon className={cn("size-3.5", meta.tone)} />
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                {meta.label}
              </span>
              <span className="text-[11px] text-slate-400">·</span>
              <span className="text-[11px] text-slate-400">{items.length}</span>
            </header>
            <div className="space-y-0.5">
              {items.map((result) => {
                const flatIndex = flatList.findIndex((r) => r.type === result.type && r.id === result.id);
                const active = flatIndex === activeIndex;
                return (
                  <button
                    key={`${result.type}-${result.id}`}
                    data-result-index={flatIndex}
                    onClick={() => onSelect(result)}
                    onMouseEnter={() => onHover(flatIndex)}
                    className={cn(
                      "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition",
                      active
                        ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                        : "hover:bg-slate-50 dark:hover:bg-slate-900",
                    )}
                  >
                    <div
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-xl ring-1 transition",
                        active
                          ? "bg-white/10 text-white ring-white/20 dark:bg-slate-900/10 dark:text-slate-900 dark:ring-slate-900/10"
                          : cn(meta.chip),
                      )}
                    >
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className={cn(
                          "truncate font-medium",
                          active ? "" : "text-slate-900 dark:text-white",
                        )}
                      >
                        {result.title}
                      </div>
                      {result.subtitle && (
                        <div
                          className={cn(
                            "truncate text-xs",
                            active ? "text-white/70 dark:text-slate-900/70" : "text-slate-500",
                          )}
                        >
                          {result.subtitle}
                        </div>
                      )}
                    </div>
                    <ArrowRight
                      className={cn(
                        "size-4 shrink-0 transition",
                        active
                          ? "translate-x-0 opacity-100"
                          : "-translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-100",
                      )}
                    />
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
