"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, LayoutGrid, Activity, Sparkles } from "lucide-react";
import { ListPageLayout } from "@/components/layouts/list-page-layout";
import { DataTable } from "@/components/ui/data-table";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import { CreateWithAiDialog } from "@/components/projects/create-with-ai-dialog";
import { getProjectColumns, type ProjectRow } from "@/components/projects/project-columns";
import { useProjects } from "@/lib/api/hooks";
import { useDeleteProject, useCloneProject } from "@/lib/api/mutations";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toArray, formatCurrency } from "@/lib/utils";
import { ChartCard, DonutChart, BarChart, CHART_COLORS } from "@/components/charts";
import { useAuthStore } from "@/lib/store/auth-store";
import { PortfolioView } from "@/components/projects/portfolio-view";
import { cn } from "@/lib/utils";

export default function ProjectsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = useProjects();
  const deleteMutation = useDeleteProject();
  const roles = useAuthStore((s) => s.user?.roles ?? []);
  const canSeeFinance = roles.some((r) =>
    ["SUPER_ADMIN", "ADMIN", "FINANCE_MANAGER", "PROJECT_MANAGER"].includes(r),
  );
  const canSeeHealth = roles.some((r) =>
    ["SUPER_ADMIN", "ADMIN", "PROJECT_MANAGER", "HR_MANAGER", "FINANCE_MANAGER"].includes(r),
  );
  const canDelete = roles.includes("SUPER_ADMIN" as any);

  // View toggle — "list" is the default (operational list); "health" shows the
  // cross-project portfolio dashboard. URL-driven so it's bookmarkable and the
  // back button works. Hidden for employees since they only see their own.
  const view: "list" | "health" =
    canSeeHealth && searchParams.get("view") === "health" ? "health" : "list";
  const setView = (v: "list" | "health") => {
    const p = new URLSearchParams(searchParams.toString());
    if (v === "list") p.delete("view");
    else p.set("view", v);
    const qs = p.toString();
    router.replace(qs ? `/projects?${qs}` : "/projects");
  };

  const [createOpen, setCreateOpen] = useState(false);
  const [aiCreateOpen, setAiCreateOpen] = useState(false);
  const [editData, setEditData] = useState<ProjectRow | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<ProjectRow | undefined>();
  const [cloneTarget, setCloneTarget] = useState<ProjectRow | undefined>();
  const [cloneName, setCloneName] = useState("");
  const [cloneOpts, setCloneOpts] = useState({
    cloneMembers: true,
    cloneStatuses: true,
    cloneLabels: true,
    cloneRecurring: false,
    cloneMilestones: false,
  });
  const cloneMutation = useCloneProject();

  if (query.isLoading) return <LoadingState label="Loading projects..." />;
  if (query.isError || !query.data) return <ErrorState label="Unable to load projects." />;

  const projects = toArray<ProjectRow>(query.data);

  const STATUS_COLOR: Record<string, string> = {
    PLANNING: CHART_COLORS.cyan,
    ACTIVE: CHART_COLORS.emerald,
    ON_HOLD: CHART_COLORS.amber,
    COMPLETED: CHART_COLORS.primary,
    CANCELLED: CHART_COLORS.red,
  };
  const statusBuckets = ["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"] as const;
  const projectStatusData = statusBuckets
    .map((s) => ({ label: s.replace("_", " "), value: projects.filter((p) => p.status === s).length, color: STATUS_COLOR[s] }))
    .filter((d) => d.value > 0);

  const budgetData = projects
    .filter((p) => p.budget != null)
    .slice(0, 8)
    .map((p) => ({ label: p.name.slice(0, 18), value: Number(p.budget ?? 0) }));

  const openClone = (row: ProjectRow) => {
    setCloneTarget(row);
    setCloneName(`${row.name} (Copy)`);
    setCloneOpts({
      cloneMembers: true,
      cloneStatuses: true,
      cloneLabels: true,
      cloneRecurring: false,
      cloneMilestones: false,
    });
  };

  const columns = getProjectColumns({
    onView: (row) => router.push(`/projects/${row.id}`),
    onEdit: (row) => { setEditData(row); setCreateOpen(true); },
    onDelete: (row) => setDeleteTarget(row),
    onClone: openClone,
    canSeeFinance,
    canDelete,
  });

  return (
    <ListPageLayout
      module="projects"
      title="Delivery portfolio"
      description="Track active delivery work, ownership, and progress signals across client engagements."
      primaryAction={{
        label: "Create with AI",
        icon: <Sparkles className="mr-1 size-4" />,
        onClick: () => setAiCreateOpen(true),
        permission: "projects:create",
      }}
      secondaryActions={[
        {
          label: "New project",
          icon: <Plus className="mr-1 size-4" />,
          onClick: () => { setEditData(undefined); setCreateOpen(true); },
          permission: "projects:create",
        },
      ]}
      counts={[
        { label: "active", value: projects.filter((p) => p.status === "ACTIVE").length, tone: "positive" },
        { label: "total", value: projects.length },
      ]}
    >
      {canSeeHealth && (
        <div className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => setView("list")}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-md px-3 text-[11px] font-medium transition",
              view === "list"
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200",
            )}
          >
            <LayoutGrid className="size-3.5" /> List
          </button>
          <button
            type="button"
            onClick={() => setView("health")}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-md px-3 text-[11px] font-medium transition",
              view === "health"
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200",
            )}
          >
            <Activity className="size-3.5" /> Health
          </button>
        </div>
      )}

      {view === "health" ? (
        <PortfolioView />
      ) : (
        <>
      <div className={`grid gap-4 ${canSeeFinance ? "md:grid-cols-2" : ""}`}>
        <ChartCard title="Projects by Status">
          <DonutChart data={projectStatusData} total={String(projects.length)} totalLabel="projects" height={220} />
        </ChartCard>
        {canSeeFinance && (
          <ChartCard title="Budget by Project" description="Top projects by budget">
            <BarChart data={budgetData} color={CHART_COLORS.primary} height={220} formatValue={(n) => formatCurrency(n)} />
          </ChartCard>
        )}
      </div>

      {/* My Spaces — clickable cards for quick project entry */}
      {projects.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">My Spaces</h3>
            <span className="text-xs text-slate-400">{projects.length} project{projects.length === 1 ? "" : "s"}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {projects.slice(0, 12).map((p) => {
              const color = STATUS_COLOR[p.status] ?? CHART_COLORS.slate;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => router.push(`/projects/${p.id}`)}
                  className="group relative overflow-hidden rounded-xl border border-border/60 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md dark:bg-slate-900/60"
                >
                  <span
                    className="absolute left-0 top-0 h-full w-1"
                    style={{ backgroundColor: color }}
                    aria-hidden
                  />
                  <div className="pl-2">
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ backgroundColor: color }} aria-hidden />
                      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                        {p.status?.replace?.("_", " ") ?? "—"}
                      </span>
                    </div>
                    <div className="mt-2 line-clamp-1 text-sm font-semibold text-slate-900 group-hover:text-primary dark:text-white">
                      {p.name}
                    </div>
                    {canSeeFinance && (p as any).client?.companyName && (
                      <div className="mt-1 line-clamp-1 text-xs text-slate-500">
                        {(p as any).client.companyName}
                      </div>
                    )}
                    <div className="mt-3 flex items-center gap-1.5 overflow-hidden">
                      {((p as any).members ?? []).slice(0, 4).map((m: any) => (
                        <span
                          key={m.userId ?? m.user?.id}
                          title={`${m.user?.firstName ?? ""} ${m.user?.lastName ?? ""}`.trim()}
                          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600 ring-2 ring-white dark:bg-slate-700 dark:text-slate-300 dark:ring-slate-900"
                        >
                          {(m.user?.firstName?.[0] ?? "") + (m.user?.lastName?.[0] ?? "")}
                        </span>
                      ))}
                      {((p as any).members?.length ?? 0) > 4 && (
                        <span className="text-[10px] text-slate-400">+{((p as any).members?.length ?? 0) - 4}</span>
                      )}
                      {((p as any).members?.length ?? 0) === 0 && (
                        <span className="text-[10px] italic text-slate-400">No members yet</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        data={projects}
        searchPlaceholder="Search projects..."
        searchColumn="name"
        filterOptions={[
          {
            column: "status",
            label: "Status",
            options: [
              { value: "PLANNING", label: "Planning" },
              { value: "ACTIVE", label: "Active" },
              { value: "ON_HOLD", label: "On Hold" },
              { value: "COMPLETED", label: "Completed" },
              { value: "CANCELLED", label: "Cancelled" },
            ],
          },
        ]}
        onRowClick={(row) => router.push(`/projects/${row.id}`)}
        moduleColor="projects"
        emptyState={{
          title: "No projects yet",
          description: "Create your first project to get started.",
        }}
      />
        </>
      )}

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} editData={editData} />
      <CreateWithAiDialog open={aiCreateOpen} onOpenChange={setAiCreateOpen} />

      <Dialog open={!!cloneTarget} onOpenChange={(o) => { if (!o) setCloneTarget(undefined); }}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Clone from {cloneTarget?.name ?? "project"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                New project name
              </label>
              <Input value={cloneName} onChange={(e) => setCloneName(e.target.value)} />
            </div>
            <div className="space-y-2 rounded-lg border border-border/60 p-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                What to include
              </div>
              {([
                ["cloneMembers", "Members"],
                ["cloneStatuses", "Custom statuses"],
                ["cloneLabels", "Labels"],
                ["cloneRecurring", "Recurring tasks"],
                ["cloneMilestones", "Milestones"],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={cloneOpts[key]}
                    onChange={(e) => setCloneOpts((prev) => ({ ...prev, [key]: e.target.checked }))}
                    className="size-4 rounded border-slate-300 text-primary focus:ring-primary"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setCloneTarget(undefined)}>Cancel</Button>
            <Button
              type="button"
              disabled={cloneMutation.isPending || !cloneName.trim() || !cloneTarget}
              onClick={() => {
                if (!cloneTarget) return;
                cloneMutation.mutate(
                  { id: cloneTarget.id, options: { name: cloneName.trim(), ...cloneOpts } },
                  {
                    onSuccess: (res: any) => {
                      setCloneTarget(undefined);
                      if (res?.id) router.push(`/projects/${res.id}`);
                    },
                  },
                );
              }}
            >
              {cloneMutation.isPending ? "Cloning…" : "Clone project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(undefined); }}
        title="Delete project"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        variant="destructive"
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(undefined) });
          }
        }}
        loading={deleteMutation.isPending}
      />
    </ListPageLayout>
  );
}
