# Phase 2: Dashboard + Projects + Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the read-only Dashboard, Projects, and Tasks pages into fully interactive CRUD modules using the Phase 1 design system components.

**Architecture:** Add mutation hooks to the API client layer, build create/edit modals with form validation, create a project detail page with tabs, and make the task kanban interactive with status changes and task creation. All new UI uses the Workspace Hub style (colorful, badge-heavy, light theme).

**Tech Stack:** Next.js 15, React 19, TanStack Query mutations, react-hook-form + zod, Radix Dialog, Phase 1 design system components (DataTable, Dialog, FormField, Select, DatePicker, StatusBadge, toast)

---

## File Structure

### New Files
| Path | Responsibility |
|------|---------------|
| `apps/web/lib/api/mutations.ts` | All mutation hooks (create, update, delete) for projects and tasks |
| `apps/web/components/projects/create-project-dialog.tsx` | Modal form for creating/editing a project |
| `apps/web/components/projects/project-columns.tsx` | TanStack Table column definitions for projects DataTable |
| `apps/web/app/(dashboard)/projects/[id]/page.tsx` | Project detail page with tabs (Overview, Tasks, Milestones, Team) |
| `apps/web/components/projects/project-overview-tab.tsx` | Overview tab content for project detail |
| `apps/web/components/projects/project-tasks-tab.tsx` | Tasks tab content for project detail |
| `apps/web/components/tasks/create-task-dialog.tsx` | Modal form for creating/editing a task |
| `apps/web/components/tasks/kanban-column.tsx` | Single kanban column component |
| `apps/web/components/tasks/task-card.tsx` | Individual task card for kanban board |
| `apps/web/components/dashboard/quick-actions.tsx` | Quick action buttons widget for dashboard |
| `apps/web/components/dashboard/pending-approvals.tsx` | Pending items widget for dashboard |
| `apps/web/components/dashboard/activity-feed.tsx` | Recent activity feed widget |

### Modified Files
| Path | Changes |
|------|---------|
| `apps/web/lib/api/hooks.ts` | Add `useProject(id)`, `useProjectTasks(id)`, typed query responses |
| `apps/web/app/(dashboard)/dashboard/page.tsx` | Add quick actions, pending approvals, activity feed widgets |
| `apps/web/app/(dashboard)/projects/page.tsx` | Replace card grid with DataTable + create button |
| `apps/web/app/(dashboard)/tasks/page.tsx` | Rebuild as interactive kanban with create/edit/status-change |
| `apps/web/components/dashboard/stat-card.tsx` | Add module color support and click-through |

---

## Task 1: API Mutation Hooks

**Files:**
- Create: `apps/web/lib/api/mutations.ts`
- Modify: `apps/web/lib/api/client.ts`
- Modify: `apps/web/lib/api/hooks.ts`

- [ ] **Step 1: Add apiPost/apiPatch/apiDelete helpers to the API client**

In `apps/web/lib/api/client.ts`, the existing `apiFetch` already supports `init` with method/body. But we need convenience wrappers. Add after the `apiFetchForm` function:

```ts
export async function apiPost<T>(path: string, data: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function apiPatch<T>(path: string, data: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function apiDelete<T>(path: string): Promise<T> {
  return apiFetch<T>(path, {
    method: "DELETE",
  });
}
```

- [ ] **Step 2: Add typed query hooks for single project and project tasks**

In `apps/web/lib/api/hooks.ts`, add these hooks:

```ts
export function useProject(id: string) {
  return useApiQuery<Record<string, unknown>>(["project", id], `/projects/${id}`, !!id);
}

export function useProjectTasks(projectId: string) {
  return useApiQuery<{ data: Array<Record<string, unknown>> }>(
    ["project-tasks", projectId],
    `/tasks?projectId=${projectId}`,
    !!projectId,
  );
}

export function useUsers() {
  return useApiQuery<{ data: Array<Record<string, unknown>> }>(["users"], "/users");
}
```

- [ ] **Step 3: Create the mutations file**

Create `apps/web/lib/api/mutations.ts`:

```ts
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost, apiPatch, apiDelete } from "./client";
import { toast } from "@/lib/hooks/use-toast";

// ── Projects ──

interface CreateProjectData {
  name: string;
  clientId: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  budget?: number;
  status?: string;
  managerId?: string;
  memberIds?: string[];
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProjectData) => apiPost("/projects", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["projects"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
      toast({ variant: "success", title: "Project created" });
    },
    onError: () => {
      toast({ variant: "error", title: "Failed to create project" });
    },
  });
}

export function useUpdateProject(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CreateProjectData>) => apiPatch(`/projects/${id}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["projects"] });
      void qc.invalidateQueries({ queryKey: ["project", id] });
      toast({ variant: "success", title: "Project updated" });
    },
    onError: () => {
      toast({ variant: "error", title: "Failed to update project" });
    },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/projects/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["projects"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
      toast({ variant: "success", title: "Project deleted" });
    },
    onError: () => {
      toast({ variant: "error", title: "Failed to delete project" });
    },
  });
}

// ── Tasks ──

interface CreateTaskData {
  projectId: string;
  title: string;
  description?: string;
  assignedToId?: string;
  status?: string;
  priority?: string;
  dueDate?: string;
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTaskData) => apiPost("/tasks", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tasks"] });
      void qc.invalidateQueries({ queryKey: ["project-tasks"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
      toast({ variant: "success", title: "Task created" });
    },
    onError: () => {
      toast({ variant: "error", title: "Failed to create task" });
    },
  });
}

export function useUpdateTask(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CreateTaskData>) => apiPatch(`/tasks/${id}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tasks"] });
      void qc.invalidateQueries({ queryKey: ["project-tasks"] });
      toast({ variant: "success", title: "Task updated" });
    },
    onError: () => {
      toast({ variant: "error", title: "Failed to update task" });
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/tasks/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tasks"] });
      void qc.invalidateQueries({ queryKey: ["project-tasks"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
      toast({ variant: "success", title: "Task deleted" });
    },
    onError: () => {
      toast({ variant: "error", title: "Failed to delete task" });
    },
  });
}

export function useAddTaskComment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { content: string }) => apiPost(`/tasks/${taskId}/comments`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tasks"] });
      toast({ variant: "success", title: "Comment added" });
    },
    onError: () => {
      toast({ variant: "error", title: "Failed to add comment" });
    },
  });
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build --workspace @nuro7/web 2>&1 | tail -5`
Expected: `✓ Compiled successfully`

- [ ] **Step 5: Commit**

```
git add apps/web/lib/api/
git commit -m "feat: add API mutation hooks for projects and tasks"
```

---

## Task 2: Create Project Dialog

**Files:**
- Create: `apps/web/components/projects/create-project-dialog.tsx`

- [ ] **Step 1: Build the create/edit project dialog**

Create `apps/web/components/projects/create-project-dialog.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { NumberInput } from "@/components/ui/number-input";
import { Button } from "@/components/ui/button";
import { useCreateProject, useUpdateProject } from "@/lib/api/mutations";
import { useClients, useUsers } from "@/lib/api/hooks";

const schema = z.object({
  name: z.string().min(1, "Project name is required"),
  clientId: z.string().min(1, "Client is required"),
  description: z.string().optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  budget: z.number().optional(),
  status: z.string().optional(),
  managerId: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editData?: {
    id: string;
    name: string;
    clientId: string;
    description?: string;
    startDate?: string;
    endDate?: string;
    budget?: number;
    status?: string;
    managerId?: string;
  };
}

export function CreateProjectDialog({ open, onOpenChange, editData }: CreateProjectDialogProps) {
  const isEdit = !!editData;
  const createMutation = useCreateProject();
  const updateMutation = useUpdateProject(editData?.id ?? "");
  const clientsQuery = useClients();
  const usersQuery = useUsers();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      clientId: "",
      description: "",
      status: "PLANNING",
    },
  });

  useEffect(() => {
    if (editData) {
      form.reset({
        name: editData.name,
        clientId: editData.clientId,
        description: editData.description ?? "",
        startDate: editData.startDate ? new Date(editData.startDate) : undefined,
        endDate: editData.endDate ? new Date(editData.endDate) : undefined,
        budget: editData.budget ?? undefined,
        status: editData.status ?? "PLANNING",
        managerId: editData.managerId ?? undefined,
      });
    } else {
      form.reset({ name: "", clientId: "", description: "", status: "PLANNING" });
    }
  }, [editData, form]);

  const onSubmit = (values: FormValues) => {
    const payload = {
      ...values,
      startDate: values.startDate?.toISOString(),
      endDate: values.endDate?.toISOString(),
    };

    const mutation = isEdit ? updateMutation : createMutation;
    mutation.mutate(payload, {
      onSuccess: () => {
        onOpenChange(false);
        form.reset();
      },
    });
  };

  const clients = (clientsQuery.data?.data ?? []) as Array<{ id: string; companyName: string }>;
  const users = (usersQuery.data?.data ?? []) as Array<{ id: string; firstName: string; lastName: string }>;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Project" : "New Project"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Project Name" name="name" required error={form.formState.errors.name?.message}>
              <Input {...form.register("name")} error={!!form.formState.errors.name} placeholder="e.g. Website Redesign" />
            </FormField>

            <FormField label="Client" name="clientId" required error={form.formState.errors.clientId?.message}>
              <Select
                value={form.watch("clientId")}
                onValueChange={(v) => form.setValue("clientId", v)}
                error={!!form.formState.errors.clientId}
                placeholder="Select client"
                options={clients.map((c) => ({ value: c.id, label: c.companyName }))}
              />
            </FormField>
          </div>

          <FormField label="Description" name="description">
            <TextArea {...form.register("description")} placeholder="Brief project description..." />
          </FormField>

          <div className="grid grid-cols-3 gap-4">
            <FormField label="Start Date" name="startDate">
              <DatePicker
                value={form.watch("startDate")}
                onChange={(d) => form.setValue("startDate", d ?? undefined)}
              />
            </FormField>

            <FormField label="End Date" name="endDate">
              <DatePicker
                value={form.watch("endDate")}
                onChange={(d) => form.setValue("endDate", d ?? undefined)}
                minDate={form.watch("startDate") ?? undefined}
              />
            </FormField>

            <FormField label="Budget" name="budget">
              <NumberInput
                value={form.watch("budget")}
                onChange={(v) => form.setValue("budget", v ?? undefined)}
                prefix="INR"
                placeholder="0"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Status" name="status">
              <Select
                value={form.watch("status")}
                onValueChange={(v) => form.setValue("status", v)}
                options={[
                  { value: "PLANNING", label: "Planning" },
                  { value: "ACTIVE", label: "Active" },
                  { value: "ON_HOLD", label: "On Hold" },
                  { value: "COMPLETED", label: "Completed" },
                  { value: "CANCELLED", label: "Cancelled" },
                ]}
              />
            </FormField>

            <FormField label="Project Manager" name="managerId">
              <Select
                value={form.watch("managerId")}
                onValueChange={(v) => form.setValue("managerId", v)}
                placeholder="Select manager"
                options={users.map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName}` }))}
              />
            </FormField>
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : isEdit ? "Update" : "Create Project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build --workspace @nuro7/web 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```
git add apps/web/components/projects/
git commit -m "feat: add create/edit project dialog with form validation"
```

---

## Task 3: Projects Page with DataTable

**Files:**
- Create: `apps/web/components/projects/project-columns.tsx`
- Modify: `apps/web/app/(dashboard)/projects/page.tsx`

- [ ] **Step 1: Create project table column definitions**

Create `apps/web/components/projects/project-columns.tsx`:

```tsx
"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { createActionsColumn, type RowAction } from "@/components/ui/data-table-row-actions";
import { Eye, Pencil, Trash2 } from "lucide-react";

export interface ProjectRow {
  id: string;
  name: string;
  status: string;
  client: { companyName: string };
  manager: { firstName: string; lastName: string };
  milestones: Array<unknown>;
  budget?: number;
  startDate?: string;
  endDate?: string;
}

export function getProjectColumns(actions: {
  onView: (row: ProjectRow) => void;
  onEdit: (row: ProjectRow) => void;
  onDelete: (row: ProjectRow) => void;
}): ColumnDef<ProjectRow, unknown>[] {
  const rowActions: RowAction<ProjectRow>[] = [
    { label: "View", icon: <Eye className="size-4" />, onClick: actions.onView },
    { label: "Edit", icon: <Pencil className="size-4" />, onClick: actions.onEdit },
    { label: "Delete", icon: <Trash2 className="size-4" />, onClick: actions.onDelete, destructive: true, separator: true },
  ];

  return [
    {
      accessorKey: "name",
      header: "Project",
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.name}</div>
          <div className="text-xs text-slate-500">{row.original.client.companyName}</div>
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
      filterFn: "equals",
    },
    {
      id: "manager",
      header: "Manager",
      cell: ({ row }) => `${row.original.manager.firstName} ${row.original.manager.lastName}`,
    },
    {
      id: "milestones",
      header: "Milestones",
      cell: ({ row }) => row.original.milestones.length,
    },
    createActionsColumn(rowActions),
  ];
}
```

- [ ] **Step 2: Rewrite the projects page**

Replace the entire content of `apps/web/app/(dashboard)/projects/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { ListPageLayout } from "@/components/layouts/list-page-layout";
import { DataTable } from "@/components/ui/data-table";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import { getProjectColumns, type ProjectRow } from "@/components/projects/project-columns";
import { useProjects } from "@/lib/api/hooks";
import { useDeleteProject } from "@/lib/api/mutations";

export default function ProjectsPage() {
  const router = useRouter();
  const query = useProjects();
  const deleteMutation = useDeleteProject();

  const [createOpen, setCreateOpen] = useState(false);
  const [editData, setEditData] = useState<ProjectRow | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<ProjectRow | undefined>();

  if (query.isLoading) return <LoadingState label="Loading projects..." />;
  if (query.isError || !query.data) return <ErrorState label="Unable to load projects." />;

  const projects = (query.data.data ?? []) as ProjectRow[];

  const columns = getProjectColumns({
    onView: (row) => router.push(`/projects/${row.id}`),
    onEdit: (row) => { setEditData(row); setCreateOpen(true); },
    onDelete: (row) => setDeleteTarget(row),
  });

  return (
    <ListPageLayout
      module="projects"
      title="Delivery portfolio"
      description="Track active delivery work, ownership, and progress signals across client engagements."
      primaryAction={{
        label: "+ New Project",
        icon: <Plus className="mr-1 size-4" />,
        onClick: () => { setEditData(undefined); setCreateOpen(true); },
        permission: "projects:create",
      }}
      counts={[
        { label: "active", value: projects.filter((p) => p.status === "ACTIVE").length, tone: "positive" },
        { label: "total", value: projects.length },
      ]}
    >
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

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} editData={editData} />

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
```

- [ ] **Step 3: Verify build**

Run: `npm run build --workspace @nuro7/web 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```
git add apps/web/app/(dashboard)/projects/page.tsx apps/web/components/projects/
git commit -m "feat: replace projects grid with interactive DataTable and create/edit/delete flows"
```

---

## Task 4: Project Detail Page

**Files:**
- Create: `apps/web/app/(dashboard)/projects/[id]/page.tsx`
- Create: `apps/web/components/projects/project-overview-tab.tsx`
- Create: `apps/web/components/projects/project-tasks-tab.tsx`

- [ ] **Step 1: Build project overview tab component**

Create `apps/web/components/projects/project-overview-tab.tsx`:

```tsx
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatCurrency } from "@/lib/utils";

interface ProjectOverviewTabProps {
  project: {
    description?: string;
    status: string;
    budget?: number;
    startDate?: string;
    endDate?: string;
    client: { companyName: string; email?: string; phone?: string };
    manager: { firstName: string; lastName: string; email: string };
    members: Array<{ user: { firstName: string; lastName: string } }>;
    milestones: Array<{ id: string; title: string; status: string; dueDate?: string }>;
  };
}

export function ProjectOverviewTab({ project }: ProjectOverviewTabProps) {
  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <div className="space-y-6 xl:col-span-2">
        <Card>
          <CardTitle>Details</CardTitle>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{project.description || "No description provided."}</p>
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-xs uppercase tracking-wider text-slate-400">Status</span>
              <div className="mt-1"><StatusBadge status={project.status} /></div>
            </div>
            <div>
              <span className="text-xs uppercase tracking-wider text-slate-400">Budget</span>
              <div className="mt-1 font-semibold">{project.budget ? formatCurrency(project.budget) : "—"}</div>
            </div>
            <div>
              <span className="text-xs uppercase tracking-wider text-slate-400">Start Date</span>
              <div className="mt-1">{project.startDate ? new Date(project.startDate).toLocaleDateString() : "—"}</div>
            </div>
            <div>
              <span className="text-xs uppercase tracking-wider text-slate-400">End Date</span>
              <div className="mt-1">{project.endDate ? new Date(project.endDate).toLocaleDateString() : "—"}</div>
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle>Milestones</CardTitle>
          {project.milestones.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No milestones yet.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {project.milestones.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-xl border border-border/50 px-4 py-3 text-sm">
                  <span className="font-medium">{m.title}</span>
                  <div className="flex items-center gap-3">
                    {m.dueDate && <span className="text-xs text-slate-500">{new Date(m.dueDate).toLocaleDateString()}</span>}
                    <StatusBadge status={m.status} size="sm" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardTitle>Client</CardTitle>
          <div className="mt-3 text-sm">
            <div className="font-medium">{project.client.companyName}</div>
            {project.client.email && <div className="mt-1 text-slate-500">{project.client.email}</div>}
          </div>
        </Card>

        <Card>
          <CardTitle>Team</CardTitle>
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{project.manager.firstName} {project.manager.lastName}</span>
              <Badge tone="info" size="sm">PM</Badge>
            </div>
            {project.members.map((m, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span>{m.user.firstName} {m.user.lastName}</span>
                <Badge tone="neutral" size="sm">Member</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build project tasks tab component**

Create `apps/web/components/projects/project-tasks-tab.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { CreateTaskDialog } from "@/components/tasks/create-task-dialog";
import { useProjectTasks } from "@/lib/api/hooks";
import type { ColumnDef } from "@tanstack/react-table";

interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignedTo?: { firstName: string; lastName: string } | null;
  dueDate?: string;
}

const columns: ColumnDef<TaskRow, unknown>[] = [
  { accessorKey: "title", header: "Task", cell: ({ row }) => <span className="font-medium">{row.original.title}</span> },
  { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
  { accessorKey: "priority", header: "Priority", cell: ({ row }) => <StatusBadge status={row.original.priority} size="sm" /> },
  {
    id: "assignee",
    header: "Assignee",
    cell: ({ row }) => row.original.assignedTo
      ? `${row.original.assignedTo.firstName} ${row.original.assignedTo.lastName}`
      : "Unassigned",
  },
  {
    accessorKey: "dueDate",
    header: "Due Date",
    cell: ({ row }) => row.original.dueDate ? new Date(row.original.dueDate).toLocaleDateString() : "—",
  },
];

export function ProjectTasksTab({ projectId }: { projectId: string }) {
  const query = useProjectTasks(projectId);
  const [createOpen, setCreateOpen] = useState(false);

  const tasks = ((query.data?.data ?? []) as TaskRow[]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 size-4" /> Add Task
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={tasks}
        loading={query.isLoading}
        searchPlaceholder="Search tasks..."
        emptyState={{ title: "No tasks yet", description: "Add the first task to this project." }}
      />

      <CreateTaskDialog open={createOpen} onOpenChange={setCreateOpen} defaultProjectId={projectId} />
    </div>
  );
}
```

- [ ] **Step 3: Build the project detail page**

Create `apps/web/app/(dashboard)/projects/[id]/page.tsx`:

```tsx
"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { DetailPageLayout } from "@/components/layouts/detail-page-layout";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { ProjectOverviewTab } from "@/components/projects/project-overview-tab";
import { ProjectTasksTab } from "@/components/projects/project-tasks-tab";
import { useProject } from "@/lib/api/hooks";

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const query = useProject(id);
  const router = useRouter();

  if (query.isLoading) return <LoadingState label="Loading project..." />;
  if (query.isError || !query.data) return <ErrorState label="Unable to load project." />;

  const project = query.data as {
    id: string;
    name: string;
    description?: string;
    status: string;
    budget?: number;
    startDate?: string;
    endDate?: string;
    client: { companyName: string; email?: string; phone?: string };
    manager: { firstName: string; lastName: string; email: string };
    members: Array<{ user: { firstName: string; lastName: string } }>;
    milestones: Array<{ id: string; title: string; status: string; dueDate?: string }>;
    tasks: Array<{ id: string; title: string; status: string }>;
  };

  return (
    <DetailPageLayout
      module="projects"
      title={project.name}
      description={project.client.companyName}
      breadcrumbs={[
        { label: "Projects", href: "/projects" },
        { label: project.name },
      ]}
      tabs={[
        {
          key: "overview",
          label: "Overview",
          content: <ProjectOverviewTab project={project} />,
        },
        {
          key: "tasks",
          label: "Tasks",
          count: project.tasks?.length ?? 0,
          content: <ProjectTasksTab projectId={project.id} />,
        },
      ]}
      actions={[
        { label: "Back", onClick: () => router.push("/projects") },
      ]}
    />
  );
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build --workspace @nuro7/web 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```
git add apps/web/app/(dashboard)/projects/ apps/web/components/projects/
git commit -m "feat: add project detail page with overview and tasks tabs"
```

---

## Task 5: Create Task Dialog

**Files:**
- Create: `apps/web/components/tasks/create-task-dialog.tsx`

- [ ] **Step 1: Build the create/edit task dialog**

Create `apps/web/components/tasks/create-task-dialog.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { useCreateTask, useUpdateTask } from "@/lib/api/mutations";
import { useProjects, useUsers } from "@/lib/api/hooks";

const schema = z.object({
  projectId: z.string().min(1, "Project is required"),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  assignedToId: z.string().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  dueDate: z.date().optional(),
});

type FormValues = z.infer<typeof schema>;

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultProjectId?: string;
  editData?: {
    id: string;
    projectId: string;
    title: string;
    description?: string;
    assignedToId?: string;
    status?: string;
    priority?: string;
    dueDate?: string;
  };
}

export function CreateTaskDialog({ open, onOpenChange, defaultProjectId, editData }: CreateTaskDialogProps) {
  const isEdit = !!editData;
  const createMutation = useCreateTask();
  const updateMutation = useUpdateTask(editData?.id ?? "");
  const projectsQuery = useProjects();
  const usersQuery = useUsers();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      projectId: defaultProjectId ?? "",
      title: "",
      description: "",
      status: "TODO",
      priority: "MEDIUM",
    },
  });

  useEffect(() => {
    if (editData) {
      form.reset({
        projectId: editData.projectId,
        title: editData.title,
        description: editData.description ?? "",
        assignedToId: editData.assignedToId ?? undefined,
        status: editData.status ?? "TODO",
        priority: editData.priority ?? "MEDIUM",
        dueDate: editData.dueDate ? new Date(editData.dueDate) : undefined,
      });
    } else {
      form.reset({ projectId: defaultProjectId ?? "", title: "", description: "", status: "TODO", priority: "MEDIUM" });
    }
  }, [editData, defaultProjectId, form]);

  const onSubmit = (values: FormValues) => {
    const payload = {
      ...values,
      dueDate: values.dueDate?.toISOString(),
    };
    const mutation = isEdit ? updateMutation : createMutation;
    mutation.mutate(payload, {
      onSuccess: () => {
        onOpenChange(false);
        form.reset();
      },
    });
  };

  const projects = (projectsQuery.data?.data ?? []) as Array<{ id: string; name: string }>;
  const users = (usersQuery.data?.data ?? []) as Array<{ id: string; firstName: string; lastName: string }>;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Task" : "New Task"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField label="Title" name="title" required error={form.formState.errors.title?.message}>
            <Input {...form.register("title")} error={!!form.formState.errors.title} placeholder="Task title" />
          </FormField>

          <FormField label="Project" name="projectId" required error={form.formState.errors.projectId?.message}>
            <Select
              value={form.watch("projectId")}
              onValueChange={(v) => form.setValue("projectId", v)}
              error={!!form.formState.errors.projectId}
              placeholder="Select project"
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
              disabled={!!defaultProjectId}
            />
          </FormField>

          <FormField label="Description" name="description">
            <TextArea {...form.register("description")} placeholder="What needs to be done?" />
          </FormField>

          <div className="grid grid-cols-3 gap-4">
            <FormField label="Status" name="status">
              <Select
                value={form.watch("status")}
                onValueChange={(v) => form.setValue("status", v)}
                options={[
                  { value: "BACKLOG", label: "Backlog" },
                  { value: "TODO", label: "To Do" },
                  { value: "IN_PROGRESS", label: "In Progress" },
                  { value: "REVIEW", label: "Review" },
                  { value: "DONE", label: "Done" },
                  { value: "BLOCKED", label: "Blocked" },
                ]}
              />
            </FormField>

            <FormField label="Priority" name="priority">
              <Select
                value={form.watch("priority")}
                onValueChange={(v) => form.setValue("priority", v)}
                options={[
                  { value: "LOW", label: "Low" },
                  { value: "MEDIUM", label: "Medium" },
                  { value: "HIGH", label: "High" },
                  { value: "URGENT", label: "Urgent" },
                ]}
              />
            </FormField>

            <FormField label="Due Date" name="dueDate">
              <DatePicker
                value={form.watch("dueDate")}
                onChange={(d) => form.setValue("dueDate", d ?? undefined)}
              />
            </FormField>
          </div>

          <FormField label="Assignee" name="assignedToId">
            <Select
              value={form.watch("assignedToId")}
              onValueChange={(v) => form.setValue("assignedToId", v)}
              placeholder="Select assignee"
              options={users.map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName}` }))}
            />
          </FormField>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : isEdit ? "Update" : "Create Task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build --workspace @nuro7/web 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```
git add apps/web/components/tasks/
git commit -m "feat: add create/edit task dialog with form validation"
```

---

## Task 6: Interactive Kanban Board

**Files:**
- Create: `apps/web/components/tasks/task-card.tsx`
- Create: `apps/web/components/tasks/kanban-column.tsx`
- Modify: `apps/web/app/(dashboard)/tasks/page.tsx`

- [ ] **Step 1: Build the task card component**

Create `apps/web/components/tasks/task-card.tsx`:

```tsx
"use client";

import { StatusBadge } from "@/components/ui/status-badge";
import { Pencil } from "lucide-react";

interface TaskCardProps {
  task: {
    id: string;
    title: string;
    priority: string;
    project: { name: string };
    assignedTo?: { firstName: string; lastName: string } | null;
    dueDate?: string;
  };
  onEdit: () => void;
}

export function TaskCard({ task, onEdit }: TaskCardProps) {
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();

  return (
    <div
      className="group cursor-pointer rounded-xl border border-border/70 bg-white p-3.5 text-sm shadow-sm transition hover:shadow-md dark:bg-slate-900/80"
      onClick={onEdit}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 font-medium leading-snug">{task.title}</div>
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="shrink-0 rounded-lg p-1 text-slate-400 opacity-0 transition group-hover:opacity-100 hover:bg-slate-100 hover:text-slate-600"
        >
          <Pencil className="size-3.5" />
        </button>
      </div>

      <div className="mt-2 text-xs text-slate-500">{task.project.name}</div>

      <div className="mt-3 flex items-center justify-between">
        <StatusBadge status={task.priority} size="sm" />
        <div className="flex items-center gap-2">
          {task.dueDate && (
            <span className={`text-[10px] ${isOverdue ? "font-semibold text-red-500" : "text-slate-400"}`}>
              {new Date(task.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          )}
          {task.assignedTo && (
            <span className="flex size-6 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {task.assignedTo.firstName[0]}{task.assignedTo.lastName[0]}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build the kanban column component**

Create `apps/web/components/tasks/kanban-column.tsx`:

```tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { TaskCard } from "./task-card";

const columnColors: Record<string, string> = {
  BACKLOG: "bg-slate-500",
  TODO: "bg-blue-500",
  IN_PROGRESS: "bg-amber-500",
  REVIEW: "bg-purple-500",
  DONE: "bg-emerald-500",
  BLOCKED: "bg-red-500",
};

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  project: { name: string };
  assignedTo?: { firstName: string; lastName: string } | null;
  dueDate?: string;
}

interface KanbanColumnProps {
  status: string;
  tasks: Task[];
  onEditTask: (task: Task) => void;
  onChangeStatus: (taskId: string, newStatus: string) => void;
}

export function KanbanColumn({ status, tasks, onEditTask }: KanbanColumnProps) {
  const label = status.replaceAll("_", " ");
  const colorClass = columnColors[status] ?? "bg-slate-500";

  return (
    <div className="flex min-w-[280px] flex-col rounded-2xl bg-slate-50/80 dark:bg-slate-800/30">
      <div className="flex items-center gap-2 px-4 py-3">
        <span className={`size-2 rounded-full ${colorClass}`} />
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        <Badge tone="neutral" size="sm" className="ml-auto">{tasks.length}</Badge>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2" style={{ maxHeight: "calc(100vh - 280px)" }}>
        {tasks.length === 0 && (
          <div className="py-8 text-center text-xs text-slate-400">No tasks</div>
        )}
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} onEdit={() => onEditTask(task)} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Rewrite the tasks page as interactive kanban**

Replace the entire content of `apps/web/app/(dashboard)/tasks/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { ModuleHeader } from "@/components/layout/module-header";
import { KanbanColumn } from "@/components/tasks/kanban-column";
import { CreateTaskDialog } from "@/components/tasks/create-task-dialog";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useTasks } from "@/lib/api/hooks";
import { useUpdateTask } from "@/lib/api/mutations";

const COLUMNS = ["BACKLOG", "TODO", "IN_PROGRESS", "REVIEW", "DONE", "BLOCKED"] as const;

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  projectId?: string;
  project: { name: string };
  assignedTo?: { firstName: string; lastName: string } | null;
  assignedToId?: string;
  description?: string;
  dueDate?: string;
}

export default function TasksPage() {
  const query = useTasks();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | undefined>();

  if (query.isLoading) return <LoadingState label="Loading tasks..." />;
  if (query.isError || !query.data) return <ErrorState label="Unable to load task board." />;

  const tasks = (query.data.data ?? []) as Task[];

  const handleEditTask = (task: Task) => {
    setEditTask(task);
    setCreateOpen(true);
  };

  return (
    <div className="flex flex-col gap-6">
      <ModuleHeader
        module="tasks"
        title="Kanban Board"
        description="Manage tasks by status. Click a card to edit, use + New Task to create."
        primaryAction={{
          label: "+ New Task",
          icon: <Plus className="mr-1 size-4" />,
          onClick: () => { setEditTask(undefined); setCreateOpen(true); },
          permission: "tasks:create",
        }}
        counts={[
          { label: "in progress", value: tasks.filter((t) => t.status === "IN_PROGRESS").length, tone: "info" },
          { label: "blocked", value: tasks.filter((t) => t.status === "BLOCKED").length, tone: "destructive" },
          { label: "total", value: tasks.length },
        ]}
      />

      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((col) => (
          <KanbanColumn
            key={col}
            status={col}
            tasks={tasks.filter((t) => t.status === col)}
            onEditTask={handleEditTask}
            onChangeStatus={() => {}}
          />
        ))}
      </div>

      <CreateTaskDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        editData={editTask ? {
          id: editTask.id,
          projectId: editTask.projectId ?? "",
          title: editTask.title,
          description: editTask.description,
          assignedToId: editTask.assignedToId,
          status: editTask.status,
          priority: editTask.priority,
          dueDate: editTask.dueDate,
        } : undefined}
      />
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build --workspace @nuro7/web 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```
git add apps/web/app/(dashboard)/tasks/page.tsx apps/web/components/tasks/
git commit -m "feat: rebuild tasks page as interactive kanban board with task cards and create/edit"
```

---

## Task 7: Enhanced Dashboard

**Files:**
- Create: `apps/web/components/dashboard/quick-actions.tsx`
- Create: `apps/web/components/dashboard/pending-approvals.tsx`
- Create: `apps/web/components/dashboard/activity-feed.tsx`
- Modify: `apps/web/app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Build the quick actions widget**

Create `apps/web/components/dashboard/quick-actions.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { Plus, FolderKanban, BriefcaseBusiness, Receipt, CalendarCheck2 } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";

interface QuickAction {
  label: string;
  icon: typeof Plus;
  href: string;
  color: string;
}

const actions: QuickAction[] = [
  { label: "New Project", icon: FolderKanban, href: "/projects", color: "#8b5cf6" },
  { label: "New Task", icon: BriefcaseBusiness, href: "/tasks", color: "#f59e0b" },
  { label: "New Invoice", icon: Receipt, href: "/invoices", color: "#10b981" },
  { label: "Clock In", icon: CalendarCheck2, href: "/attendance", color: "#14b8a6" },
];

export function QuickActions() {
  const router = useRouter();

  return (
    <Card>
      <CardTitle>Quick Actions</CardTitle>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              onClick={() => router.push(action.href)}
              className="flex items-center gap-2.5 rounded-xl border border-border/50 px-3 py-2.5 text-sm font-medium transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              <Icon className="size-4" style={{ color: action.color }} />
              {action.label}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Build the pending approvals widget**

Create `apps/web/components/dashboard/pending-approvals.tsx`:

```tsx
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, Receipt, FileText } from "lucide-react";

interface PendingItem {
  label: string;
  count: number;
  icon: typeof CalendarClock;
  tone: "warning" | "destructive" | "info";
}

export function PendingApprovals({ metrics }: { metrics: Record<string, number> }) {
  const items: PendingItem[] = [
    { label: "Leave Requests", count: 0, icon: CalendarClock, tone: "warning" },
    { label: "Pending Invoices", count: Number(metrics.pendingInvoices ?? 0), icon: Receipt, tone: "destructive" },
    { label: "Draft Proposals", count: 0, icon: FileText, tone: "info" },
  ];

  const total = items.reduce((s, i) => s + i.count, 0);

  return (
    <Card>
      <div className="flex items-center justify-between">
        <CardTitle>Pending Actions</CardTitle>
        {total > 0 && <Badge tone="warning" count={total} />}
      </div>
      <div className="mt-4 space-y-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="flex items-center justify-between rounded-xl border border-border/50 px-3 py-2.5 text-sm">
              <div className="flex items-center gap-2.5">
                <Icon className="size-4 text-slate-400" />
                <span>{item.label}</span>
              </div>
              <Badge tone={item.count > 0 ? item.tone : "neutral"} size="sm">{item.count}</Badge>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
```

- [ ] **Step 3: Build the activity feed widget**

Create `apps/web/components/dashboard/activity-feed.tsx`:

```tsx
import { Card, CardTitle } from "@/components/ui/card";

interface ActivityItem {
  initials: string;
  color: string;
  text: string;
  time: string;
}

const recentActivity: ActivityItem[] = [
  { initials: "NF", color: "#3b82f6", text: "Created project \"Website Redesign\"", time: "2m ago" },
  { initials: "AK", color: "#8b5cf6", text: "Completed task \"API integration\"", time: "15m ago" },
  { initials: "RS", color: "#ec4899", text: "Submitted leave request", time: "1h ago" },
  { initials: "NK", color: "#f59e0b", text: "Sent invoice #INV-042", time: "3h ago" },
];

export function ActivityFeed() {
  return (
    <Card>
      <CardTitle>Recent Activity</CardTitle>
      <div className="mt-4 space-y-3">
        {recentActivity.map((item, i) => (
          <div key={i} className="flex items-start gap-3 text-sm">
            <span
              className="flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
              style={{ backgroundColor: item.color }}
            >
              {item.initials}
            </span>
            <div className="min-w-0 flex-1">
              <span className="text-slate-700 dark:text-slate-300">{item.text}</span>
              <span className="ml-2 text-xs text-slate-400">{item.time}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
```

- [ ] **Step 4: Update the dashboard page**

Replace the entire content of `apps/web/app/(dashboard)/dashboard/page.tsx`:

```tsx
"use client";

import { ModuleHeader } from "@/components/layout/module-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { ProjectBoard } from "@/components/dashboard/project-board";
import { WorkloadPanel } from "@/components/dashboard/workload-panel";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { PendingApprovals } from "@/components/dashboard/pending-approvals";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useDashboardSummary } from "@/lib/api/hooks";
import { formatCurrency } from "@/lib/utils";

export default function DashboardPage() {
  const summary = useDashboardSummary();

  if (summary.isLoading) return <LoadingState label="Loading the Nuro7 command center..." />;
  if (summary.isError || !summary.data) return <ErrorState label="Unable to load dashboard metrics." />;

  const metrics = summary.data.metrics;

  return (
    <div className="flex flex-col gap-8">
      <ModuleHeader
        module="dashboard"
        title="Good morning"
        description="Here's what's happening across Nuro7 today."
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Revenue" value={formatCurrency(Number(metrics.revenue ?? 0))} delta="Live" />
        <StatCard title="Expenses" value={formatCurrency(Number(metrics.expenses ?? 0))} delta="Live" />
        <StatCard title="Active Projects" value={String(metrics.activeProjects ?? 0)} />
        <StatCard title="Pending Invoices" value={String(metrics.pendingInvoices ?? 0)} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <div className="grid gap-4 xl:grid-cols-2">
            <ProjectBoard />
            <WorkloadPanel />
          </div>
          <ActivityFeed />
        </div>

        <div className="space-y-6">
          <QuickActions />
          <PendingApprovals metrics={metrics} />
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Verify build**

Run: `npm run build --workspace @nuro7/web 2>&1 | tail -5`

- [ ] **Step 6: Commit**

```
git add apps/web/app/(dashboard)/dashboard/page.tsx apps/web/components/dashboard/
git commit -m "feat: enhance dashboard with quick actions, pending approvals, and activity feed"
```

---

## Verification

After all tasks are complete:

1. **Full build:** `npm run build --workspace @nuro7/web` — must pass with 0 errors
2. **Start dev server:** `npm run dev:web` — start the frontend
3. **Visual checks:**
   - Navigate to `/projects` — should show DataTable with search, filters, "+ New Project" button
   - Click "+ New Project" — dialog should open with form fields
   - Navigate to `/tasks` — should show 6-column kanban board with task cards
   - Click "+ New Task" — dialog should open with form fields
   - Navigate to `/dashboard` — should show quick actions and pending approvals widgets
   - Click a project row — should navigate to `/projects/:id` detail page with Overview and Tasks tabs
4. **Interaction checks (requires API running):**
   - Create a project via the dialog
   - Edit a project via row action menu
   - Delete a project via row action menu (confirmation dialog)
   - Create a task via kanban "+ New Task"
   - Edit a task by clicking a kanban card
