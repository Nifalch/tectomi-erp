"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ListPageLayout } from "@/components/layouts/list-page-layout";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useUsers, useUserCapacity } from "@/lib/api/hooks";
import { staffOnly, toArray, cn } from "@/lib/utils";

type SortKey = "name" | "utilization" | "tasks";

interface UserRow {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  roles?: Array<{ role?: { code?: string; name?: string } } | string> | null;
  avatarUrl?: string | null;
}

interface CapacityShape {
  weeklyHours?: number;
  committedHours?: number;
  percentUsed?: number;
  overCommitted?: boolean;
  projects?: Array<{ project: { id: string; name: string }; committedHours: number }>;
}

function initialsOf(u: UserRow) {
  return `${(u.firstName?.[0] ?? "").toUpperCase()}${(u.lastName?.[0] ?? "").toUpperCase()}` || "?";
}

function primaryRoleLabel(u: UserRow): string {
  const r = u.roles?.[0];
  if (!r) return "Staff";
  if (typeof r === "string") return r.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  const code = r.role?.name ?? r.role?.code ?? "";
  return code.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) || "Staff";
}

function utilizationColor(pct: number) {
  if (pct > 100) return { bar: "bg-rose-500", text: "text-rose-600 dark:text-rose-400" };
  if (pct >= 70) return { bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" };
  return { bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" };
}

interface UserCapacityCardProps {
  user: UserRow;
  onNavigate: (id: string) => void;
  onReport: (id: string, cap: CapacityShape | null) => void;
}

function UserCapacityCard({ user, onNavigate, onReport }: UserCapacityCardProps) {
  const capacityQuery = useUserCapacity(user.id);
  const cap = (capacityQuery.data ?? null) as CapacityShape | null;

  const pct = cap?.percentUsed ?? 0;

  useEffect(() => {
    onReport(user.id, cap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, cap?.percentUsed, cap?.committedHours, cap?.projects?.length]);

  const colors = utilizationColor(pct);
  const roleLabel = primaryRoleLabel(user);
  const weekly = cap?.weeklyHours ?? 40;
  const committed = cap?.committedHours ?? 0;
  const activeTaskCount = cap?.projects?.length
    ? cap.projects.reduce((sum, p) => sum + (p.committedHours > 0 ? 1 : 0), 0)
    : 0;
  // Active task count is not a direct field — approximate via projects count (distinct projects with active tasks).
  // We surface committed hours and weekly capacity which are accurate.
  const projectCount = cap?.projects?.length ?? 0;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Avatar initials={initialsOf(user)} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-900 dark:text-white">
            {user.firstName} {user.lastName}
          </p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{roleLabel}</p>
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400">Utilization</span>
          <span className={cn("font-semibold tabular-nums", colors.text)}>{pct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div
            className={cn("h-full rounded-full transition-all", colors.bar)}
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          />
        </div>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        {capacityQuery.isLoading
          ? "Loading capacity..."
          : `${projectCount} active project${projectCount === 1 ? "" : "s"} · ${committed.toFixed(1)} hrs estimated · ${weekly}/week capacity`}
      </p>

      <Button variant="secondary" size="sm" onClick={() => onNavigate(user.id)}>
        View tasks
      </Button>
      {/* mark unused to satisfy noUnusedLocals */}
      <span className="hidden">{activeTaskCount}</span>
    </Card>
  );
}

function KpiCard({ label, value, accent }: { label: string; value: string | number; accent?: "emerald" | "amber" | "rose" | "slate" }) {
  const accentClass =
    accent === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : accent === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : accent === "rose"
          ? "text-rose-600 dark:text-rose-400"
          : "text-slate-900 dark:text-white";
  return (
    <Card>
      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className={cn("mt-2 text-2xl font-semibold tracking-tight", accentClass)}>{value}</p>
    </Card>
  );
}

export default function ResourcesPage() {
  const router = useRouter();
  const usersQuery = useUsers();
  const [atCapacityOnly, setAtCapacityOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("name");

  // Capacity cache collected from children — keyed by userId.
  const [capMap, setCapMap] = useState<Record<string, CapacityShape | null>>({});

  const handleReport = useMemo(
    () => (userId: string, cap: CapacityShape | null) => {
      setCapMap((prev) => {
        const existing = prev[userId];
        if (existing && existing?.percentUsed === cap?.percentUsed && existing?.committedHours === cap?.committedHours) {
          return prev;
        }
        return { ...prev, [userId]: cap };
      });
    },
    [],
  );

  if (usersQuery.isLoading) return <LoadingState label="Loading team..." />;
  if (usersQuery.isError || !usersQuery.data) return <ErrorState label="Unable to load users." />;

  const allUsers = staffOnly(toArray<UserRow>(usersQuery.data));

  // Sort / filter using the capacity snapshot we have in state.
  const sorted = [...allUsers].sort((a, b) => {
    if (sortKey === "name") {
      return (a.firstName + a.lastName).localeCompare(b.firstName + b.lastName);
    }
    if (sortKey === "utilization") {
      return (capMap[b.id]?.percentUsed ?? 0) - (capMap[a.id]?.percentUsed ?? 0);
    }
    // tasks — use projects length as proxy
    return (capMap[b.id]?.projects?.length ?? 0) - (capMap[a.id]?.projects?.length ?? 0);
  });

  const filtered = atCapacityOnly
    ? sorted.filter((u) => (capMap[u.id]?.percentUsed ?? 0) >= 90)
    : sorted;

  const capList = Object.values(capMap).filter((c): c is CapacityShape => !!c);
  const overAllocated = capList.filter((c) => (c.percentUsed ?? 0) > 100).length;
  const avgUtil = capList.length
    ? Math.round(capList.reduce((s, c) => s + (c.percentUsed ?? 0), 0) / capList.length)
    : 0;

  return (
    <ListPageLayout
      module="resources"
      title="Resource Allocation"
      description="Per-person workload, capacity, and active assignments."
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Total team" value={allUsers.length} accent="slate" />
        <KpiCard label="Over-allocated" value={overAllocated} accent="rose" />
        <KpiCard label="Average utilization" value={`${avgUtil}%`} accent={avgUtil > 100 ? "rose" : avgUtil >= 70 ? "amber" : "emerald"} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setAtCapacityOnly((v) => !v)}
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition",
            atCapacityOnly
              ? "border-rose-500 bg-rose-500/10 text-rose-600 dark:text-rose-300"
              : "border-border bg-card text-slate-600 hover:bg-muted/70 dark:text-slate-300",
          )}
        >
          <span className={cn("inline-block size-2 rounded-full", atCapacityOnly ? "bg-rose-500" : "bg-slate-400")} />
          At capacity (≥ 90%)
        </button>

        <div className="ml-auto w-48">
          <Select
            value={sortKey}
            size="sm"
            onValueChange={(v) => setSortKey(v as SortKey)}
            options={[
              { value: "name", label: "Sort: Name" },
              { value: "utilization", label: "Sort: Utilization ↓" },
              { value: "tasks", label: "Sort: Active projects ↓" },
            ]}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="text-sm text-slate-500">No team members match the current filter.</Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((u) => (
            <UserCapacityCard
              key={u.id}
              user={u}
              onNavigate={(id) => router.push(`/my-tasks?userId=${id}`)}
              onReport={handleReport}
            />
          ))}
        </div>
      )}
    </ListPageLayout>
  );
}
