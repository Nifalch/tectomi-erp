# HR Employee 360° UI Implementation Plan (Plan 2B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Next.js UI for the Employee 360° detail page — a route at `/hr/employees/[userId]` with a header, quick stats, tab bar, and 12 tab components, all consuming the API endpoints shipped in Plan 2A.

**Architecture:** The page route lazy-loads each tab via TanStack Query — the Overview tab loads with the page (root call returns it), every other tab fetches its data when activated. Tab state is URL-synced (`?tab=performance`) so deep links work. The header and quick-stats render from the root payload's masked DTO. Tabs the viewer can't access are hidden by reading `accessibleTabs` (returned by the root endpoint).

**Tech Stack:** Next.js App Router (`apps/web`), TanStack Query, Zustand auth store, shadcn-style UI primitives (already in the codebase — `tabs.tsx`, `avatar.tsx`, `card.tsx`, etc.), Tailwind.

**Spec:** [docs/superpowers/specs/2026-05-04-hr-operations-system-design.md](../specs/2026-05-04-hr-operations-system-design.md)

**Depends on:** Plan 2A (all 16 API endpoints live).

**Verification model:** type-check from `apps/web/` + page renders + at least one tab loads + permissions visually match (HR sees salary, peer doesn't).

**Project working directory:** `/Users/nifal/Documents/nuro`

---

## File map

**Web (new files):**
- `apps/web/lib/api/employee-profile.ts` — typed query/mutation hooks for the 16 endpoints.
- `apps/web/app/(dashboard)/hr/employees/[userId]/page.tsx` — the route shell.
- `apps/web/components/hr/employee/employee-header.tsx`
- `apps/web/components/hr/employee/employee-quick-stats.tsx`
- `apps/web/components/hr/employee/employee-tab-bar.tsx`
- `apps/web/components/hr/employee/career-event-dialog.tsx` — small form dialog used from the Career tab.
- `apps/web/components/hr/employee/hr-note-form.tsx` — inline form used from the Notes tab.
- `apps/web/components/hr/employee/tabs/overview-tab.tsx`
- `apps/web/components/hr/employee/tabs/attendance-tab.tsx`
- `apps/web/components/hr/employee/tabs/leave-tab.tsx`
- `apps/web/components/hr/employee/tabs/performance-tab.tsx`
- `apps/web/components/hr/employee/tabs/payroll-tab.tsx`
- `apps/web/components/hr/employee/tabs/career-tab.tsx`
- `apps/web/components/hr/employee/tabs/projects-tab.tsx`
- `apps/web/components/hr/employee/tabs/documents-tab.tsx`
- `apps/web/components/hr/employee/tabs/assets-tab.tsx`
- `apps/web/components/hr/employee/tabs/onboarding-tab.tsx`
- `apps/web/components/hr/employee/tabs/timeline-tab.tsx`
- `apps/web/components/hr/employee/tabs/notes-tab.tsx`

**Web (modify):**
- `apps/web/app/(dashboard)/hr/page.tsx` — wrap each employee card in a link to `/hr/employees/[userId]`.
- `apps/web/app/(dashboard)/profile/page.tsx` — add a "View HR profile (My Details)" link to `/hr/employees/me`.

---

## Task 1: Hooks — typed queries + mutations for all 16 endpoints

**File:** `apps/web/lib/api/employee-profile.ts` (new)

- [ ] **Step 1: Create the hooks file**

```typescript
// apps/web/lib/api/employee-profile.ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";
import { apiPost, apiPatch, apiDelete } from "./client";  // adjust if your client.ts exports differ
import { toast } from "@/components/ui/use-toast";          // adjust to whatever the toast helper actually is

type TabKey =
  | "overview" | "attendance" | "leave" | "performance" | "payroll" | "career"
  | "projects" | "documents" | "assets" | "onboarding" | "timeline" | "notes";

export interface EmployeeOverview {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
  phone: string | null;
  status: string;
  joinDate: string | null;
  department: string | null;
  designation: string | null;
  employmentType: string | null;
  salary: number | null;
  hourlyRate: number | null;
  manager: string | null;
  emergencyContact: string | null;
  performanceScore: number | null;
  terminated: boolean;
  roles: Array<{ code: string; name: string }>;
  accessibleTabs: TabKey[];
}

const baseKey = (userId: string) => ["employee-profile", userId] as const;

export function useEmployeeProfile(userId: string) {
  return useQuery({
    queryKey: baseKey(userId),
    queryFn: () => apiFetch<EmployeeOverview>(`/hr/employees/${userId}`),
    enabled: !!userId,
  });
}

function useTabQuery<T>(userId: string, tab: TabKey, enabled = true) {
  return useQuery({
    queryKey: [...baseKey(userId), tab],
    queryFn: () => apiFetch<T>(`/hr/employees/${userId}/${tab}`),
    enabled: !!userId && enabled,
  });
}

export const useEmployeeAttendance = (userId: string, enabled = true) =>
  useTabQuery<{ records: Array<Record<string, unknown>> }>(userId, "attendance", enabled);
export const useEmployeeLeave = (userId: string, enabled = true) =>
  useTabQuery<{ requests: Array<Record<string, unknown>>; balances: Array<Record<string, unknown>> }>(
    userId, "leave", enabled,
  );
export const useEmployeePerformance = (userId: string, enabled = true) =>
  useTabQuery<{ reviews: Array<Record<string, unknown>>; goals: Array<Record<string, unknown>> }>(
    userId, "performance", enabled,
  );
export const useEmployeePayroll = (userId: string, enabled = true) =>
  useTabQuery<{ salaryStructure: Record<string, unknown> | null; paySlips: Array<Record<string, unknown>> }>(
    userId, "payroll", enabled,
  );
export const useEmployeeCareer = (userId: string, enabled = true) =>
  useTabQuery<{ entries: Array<{ kind: string; id: string; effectiveDate: string; summary: string; details?: string | null }> }>(
    userId, "career", enabled,
  );
export const useEmployeeProjects = (userId: string, enabled = true) =>
  useTabQuery<{ projects: Array<Record<string, unknown>>; openTasks: Array<Record<string, unknown>>; completedTaskCount: number }>(
    userId, "projects", enabled,
  );
export const useEmployeeDocuments = (userId: string, enabled = true) =>
  useTabQuery<{ documents: Array<Record<string, unknown>> }>(userId, "documents", enabled);
export const useEmployeeAssets = (userId: string, enabled = true) =>
  useTabQuery<{ assets: Array<Record<string, unknown>> }>(userId, "assets", enabled);
export const useEmployeeOnboarding = (userId: string, enabled = true) =>
  useTabQuery<{ checklists: Array<Record<string, unknown>> }>(userId, "onboarding", enabled);
export const useEmployeeTimeline = (userId: string, enabled = true) =>
  useTabQuery<{ entries: Array<{ kind: string; id: string; at: string; summary: string; details?: string | null }> }>(
    userId, "timeline", enabled,
  );
export const useEmployeeNotes = (userId: string, enabled = true) =>
  useTabQuery<{ notes: Array<{ id: string; body: string; category: string; createdAt: string; author: { firstName: string; lastName: string } }> }>(
    userId, "notes", enabled,
  );

// ── Mutations ──

export function useAddHrNote(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { body: string; category?: string }) =>
      apiPost(`/hr/employees/${userId}/notes`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...baseKey(userId), "notes"] });
      toast({ variant: "success", title: "Note added" });
    },
    onError: (err: Error) =>
      toast({ variant: "error", title: "Failed to add note", description: err?.message }),
  });
}

export function useDeleteHrNote(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (noteId: string) => apiDelete(`/hr/employees/${userId}/notes/${noteId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...baseKey(userId), "notes"] });
      toast({ variant: "success", title: "Note deleted" });
    },
    onError: (err: Error) =>
      toast({ variant: "error", title: "Failed to delete note", description: err?.message }),
  });
}

export function useAddCareerEvent(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      type: string;
      fromValue?: string;
      toValue?: string;
      effectiveDate: string;
      reason?: string;
    }) => apiPost(`/hr/employees/${userId}/career-events`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: baseKey(userId) });
      toast({ variant: "success", title: "Career event logged" });
    },
    onError: (err: Error) =>
      toast({ variant: "error", title: "Failed to log event", description: err?.message }),
  });
}

export function useResendInvite(userId: string) {
  return useMutation({
    mutationFn: () => apiPost(`/hr/employees/${userId}/resend-invite`, {}),
    onSuccess: (data: { success: boolean; reason?: string; message?: string }) =>
      toast({
        variant: data.success ? "success" : "info",
        title: data.success ? "Invite resent" : "No invite resent",
        description: data.reason ?? data.message,
      }),
    onError: (err: Error) =>
      toast({ variant: "error", title: "Failed to resend invite", description: err?.message }),
  });
}
```

- [ ] **Step 2: Verify imports match existing client**

`apps/web/lib/api/client.ts` exports `apiFetch`, `apiPost`, `apiPatch`. Check whether it also exports `apiDelete`. If not, either add it (preferred — short helper) or use `apiFetch` with `{ method: "DELETE" }`. Read the file first:

```bash
cat /Users/nifal/Documents/nuro/apps/web/lib/api/client.ts | head -80
```

If `apiDelete` doesn't exist, add it next to `apiPost`:

```typescript
export function apiDelete<T>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: "DELETE" });
}
```

The toast import path varies by codebase. The existing mutations file at `apps/web/lib/api/mutations.ts` already imports `toast` from somewhere — match its import statement exactly. (Likely `@/components/ui/use-toast` or a custom hook.)

- [ ] **Step 3: Verify typecheck**

```bash
cd /Users/nifal/Documents/nuro/apps/web && npx tsc --noEmit
```

Expected: no output. If a tab response shape doesn't match what the API actually returns, adjust the type — check the API service in `apps/api/src/modules/hr/employee-profile/employee-profile.service.ts` for ground truth.

- [ ] **Step 4: Commit**

```bash
cd /Users/nifal/Documents/nuro
git add apps/web/lib/api/employee-profile.ts apps/web/lib/api/client.ts
git commit -m "feat(hr): add typed query and mutation hooks for Employee 360°"
```

(Only include `client.ts` in the add if you actually added `apiDelete`.)

---

## Task 2: Page shell — `/hr/employees/[userId]` with header, quick stats, and tab bar

**Files:**
- Create: `apps/web/app/(dashboard)/hr/employees/[userId]/page.tsx`
- Create: `apps/web/components/hr/employee/employee-header.tsx`
- Create: `apps/web/components/hr/employee/employee-quick-stats.tsx`
- Create: `apps/web/components/hr/employee/employee-tab-bar.tsx`

This task delivers a working page that loads, shows the identity header, displays the quick-stats chips, and has a tab bar with placeholder bodies. All 12 tab bodies in Tasks 3-5 plug into this shell.

- [ ] **Step 1: `EmployeeHeader` component**

```typescript
// apps/web/components/hr/employee/employee-header.tsx
"use client";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { EmployeeOverview } from "@/lib/api/employee-profile";
import { useResendInvite } from "@/lib/api/employee-profile";
import { useAuthStore } from "@/lib/store/auth-store";

const HR_ROLES = ["SUPER_ADMIN", "ADMIN", "HR_MANAGER"];

interface Props {
  employee: EmployeeOverview;
}

export function EmployeeHeader({ employee }: Props) {
  const viewerRoles = useAuthStore((s) => s.user?.roles ?? []);
  const isHr = viewerRoles.some((r) => HR_ROLES.includes(r));
  const resendInvite = useResendInvite(employee.userId);

  const fullName = `${employee.firstName} ${employee.lastName}`.trim();
  const tenure = employee.joinDate
    ? `${Math.max(0, Math.round((Date.now() - new Date(employee.joinDate).getTime()) / (1000 * 60 * 60 * 24 * 365)))} yrs`
    : null;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-start">
      <Avatar src={employee.avatarUrl ?? undefined} fallback={fullName.slice(0, 2).toUpperCase()} size="lg" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">{fullName}</h1>
          {employee.terminated && <Badge tone="destructive" size="sm">Terminated</Badge>}
          {employee.status === "INVITED" && <Badge tone="warning" size="sm">Invited</Badge>}
        </div>
        <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {employee.designation}
          {employee.department ? ` · ${employee.department}` : ""}
          {tenure ? ` · ${tenure}` : ""}
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span>📧 {employee.email}</span>
          {employee.phone && <span>📞 {employee.phone}</span>}
          {employee.manager && <span>👤 {employee.manager}</span>}
          {employee.roles.map((r) => (
            <Badge key={r.code} tone="info" size="xs">{r.name}</Badge>
          ))}
        </div>
      </div>
      {isHr && (
        <div className="flex gap-2">
          {employee.status === "INVITED" && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => resendInvite.mutate()}
              disabled={resendInvite.isPending}
            >
              Resend invite
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
```

If `Avatar` or `Badge` props differ in this codebase, adjust to match the existing usage (look at how `apps/web/components/hr/employee-edit-dialog.tsx` uses `Badge` — it uses `tone` prop for variants).

- [ ] **Step 2: `EmployeeQuickStats` component**

```typescript
// apps/web/components/hr/employee/employee-quick-stats.tsx
"use client";

import { Card } from "@/components/ui/card";
import type { EmployeeOverview } from "@/lib/api/employee-profile";
import { formatCurrency } from "@/lib/utils";

interface Props {
  employee: EmployeeOverview;
}

export function EmployeeQuickStats({ employee }: Props) {
  const items: Array<{ label: string; value: string }> = [];
  if (employee.salary != null) items.push({ label: "Salary", value: formatCurrency(employee.salary) });
  if (employee.performanceScore != null)
    items.push({ label: "Performance", value: employee.performanceScore.toFixed(1) });
  if (employee.employmentType)
    items.push({ label: "Employment", value: employee.employmentType.replace("_", " ") });
  if (employee.joinDate)
    items.push({ label: "Joined", value: new Date(employee.joinDate).toLocaleDateString() });

  if (items.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map((it) => (
        <Card key={it.label} className="p-3">
          <div className="text-xs uppercase tracking-wider text-slate-400">{it.label}</div>
          <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{it.value}</div>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: `EmployeeTabBar` component (URL-synced)**

```typescript
// apps/web/components/hr/employee/employee-tab-bar.tsx
"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";
import { cn } from "@/lib/utils";

const ALL_TABS: Array<{ key: string; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "attendance", label: "Attendance" },
  { key: "leave", label: "Leave" },
  { key: "performance", label: "Performance" },
  { key: "payroll", label: "Payroll" },
  { key: "career", label: "Career" },
  { key: "projects", label: "Projects" },
  { key: "documents", label: "Documents" },
  { key: "assets", label: "Assets" },
  { key: "onboarding", label: "Onboarding" },
  { key: "timeline", label: "Timeline" },
  { key: "notes", label: "Notes" },
];

interface Props {
  activeTab: string;
  accessibleTabs: string[];
}

export function EmployeeTabBar({ activeTab, accessibleTabs }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const visibleTabs = ALL_TABS.filter((t) => accessibleTabs.includes(t.key));

  const switchTab = useCallback(
    (key: string) => {
      const sp = new URLSearchParams(params.toString());
      sp.set("tab", key);
      router.replace(`${pathname}?${sp.toString()}`);
    },
    [params, pathname, router],
  );

  return (
    <div className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
      {visibleTabs.map((t) => (
        <button
          key={t.key}
          onClick={() => switchTab(t.key)}
          className={cn(
            "whitespace-nowrap px-4 py-2 text-sm font-medium transition",
            activeTab === t.key
              ? "border-b-2 border-blue-600 text-blue-700 dark:text-blue-400"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Page route `/hr/employees/[userId]/page.tsx`**

```typescript
// apps/web/app/(dashboard)/hr/employees/[userId]/page.tsx
"use client";

import { useParams, useSearchParams } from "next/navigation";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useEmployeeProfile } from "@/lib/api/employee-profile";
import { EmployeeHeader } from "@/components/hr/employee/employee-header";
import { EmployeeQuickStats } from "@/components/hr/employee/employee-quick-stats";
import { EmployeeTabBar } from "@/components/hr/employee/employee-tab-bar";
import { OverviewTab } from "@/components/hr/employee/tabs/overview-tab";

export default function EmployeeDetailPage() {
  const params = useParams<{ userId: string }>();
  const search = useSearchParams();
  const userId = params.userId;
  const activeTab = search.get("tab") ?? "overview";

  const profile = useEmployeeProfile(userId);

  if (profile.isLoading) return <LoadingState label="Loading profile..." />;
  if (profile.isError || !profile.data) return <ErrorState label="Unable to load profile." />;

  const employee = profile.data;

  return (
    <div className="flex flex-col gap-6">
      <EmployeeHeader employee={employee} />
      <EmployeeQuickStats employee={employee} />
      <EmployeeTabBar activeTab={activeTab} accessibleTabs={employee.accessibleTabs} />
      {/* Tab body */}
      {activeTab === "overview" && <OverviewTab employee={employee} />}
      {/* Tasks 3-5 will register the other tabs here. */}
    </div>
  );
}
```

- [ ] **Step 5: `OverviewTab` placeholder** (full implementation in Task 3 below)

For now, create a minimal stub so the page renders:

```typescript
// apps/web/components/hr/employee/tabs/overview-tab.tsx
"use client";

import { Card } from "@/components/ui/card";
import type { EmployeeOverview } from "@/lib/api/employee-profile";

export function OverviewTab({ employee }: { employee: EmployeeOverview }) {
  return (
    <Card className="p-5">
      <h3 className="mb-3 font-semibold">Overview</h3>
      <pre className="text-xs text-slate-500">{JSON.stringify(employee, null, 2)}</pre>
    </Card>
  );
}
```

- [ ] **Step 6: Wire link from `/hr` employee directory cards**

In `apps/web/app/(dashboard)/hr/page.tsx`, find the existing employee card map (`team.map((emp) => (`). Wrap the entire `<Card>` in a `<Link href={\`/hr/employees/${emp.user.id}\`}>` so clicking opens the detail page. Be careful not to break the existing "Edit" button — give it `e.stopPropagation()` on click.

```typescript
// At the top of the file:
import Link from "next/link";

// Replace the card render with:
<Link key={emp.id} href={`/hr/employees/${emp.user.id}`} className="block">
  <Card className="cursor-pointer transition hover:border-blue-400">
    {/* existing card body */}
    {canSeeRate && (
      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <span>{/* ... rate text */}</span>
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setEditTarget({ /* ... */ });
          }}
        >
          Edit
        </Button>
      </div>
    )}
  </Card>
</Link>
```

- [ ] **Step 7: Verify**

```bash
cd /Users/nifal/Documents/nuro/apps/web && npx tsc --noEmit
```

Expected: no output. Boot web + API together, log in as HR, click any employee from `/hr` — the detail page should render with the header, quick-stats, tab bar, and the Overview tab showing the JSON dump.

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/\(dashboard\)/hr apps/web/components/hr/employee
git commit -m "feat(hr): Employee 360° page shell — header, quick stats, tab bar, overview stub"
```

---

## Task 3: Tabs (overview, attendance, leave, performance) — full implementations

Each tab component:
1. Imports its data hook from `lib/api/employee-profile`.
2. Reads `employee.userId` (passed in as a prop) to make the call.
3. Renders the data with the existing UI primitives.
4. Shows `LoadingState` and `ErrorState` from `@/components/ui/state`.

### 3.1 — Overview tab (full version)

Replace the stub from Task 2 Step 5. The Overview shows identity already in the header — this tab adds personal details and the masked fields for HR/Self viewers:

```typescript
// apps/web/components/hr/employee/tabs/overview-tab.tsx
"use client";

import { Card } from "@/components/ui/card";
import type { EmployeeOverview } from "@/lib/api/employee-profile";
import { formatCurrency } from "@/lib/utils";

export function OverviewTab({ employee }: { employee: EmployeeOverview }) {
  const rows: Array<{ label: string; value: string | null | undefined }> = [
    { label: "Email", value: employee.email },
    { label: "Phone", value: employee.phone },
    { label: "Department", value: employee.department },
    { label: "Designation", value: employee.designation },
    { label: "Employment type", value: employee.employmentType?.replace("_", " ") },
    { label: "Manager", value: employee.manager },
    { label: "Salary", value: employee.salary != null ? formatCurrency(employee.salary) : null },
    { label: "Hourly rate", value: employee.hourlyRate != null ? `${formatCurrency(employee.hourlyRate)}/hr` : null },
    { label: "Performance", value: employee.performanceScore != null ? employee.performanceScore.toFixed(1) : null },
    { label: "Emergency contact", value: employee.emergencyContact },
    { label: "Joined", value: employee.joinDate ? new Date(employee.joinDate).toLocaleDateString() : null },
  ].filter((r) => r.value != null && r.value !== "");

  return (
    <Card className="p-5">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between border-b border-slate-100 py-1 dark:border-slate-800">
            <dt className="text-sm text-slate-500">{r.label}</dt>
            <dd className="text-sm font-medium text-slate-900 dark:text-white">{r.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
```

### 3.2 — Attendance tab

```typescript
// apps/web/components/hr/employee/tabs/attendance-tab.tsx
"use client";

import { Card } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useEmployeeAttendance } from "@/lib/api/employee-profile";

export function AttendanceTab({ userId }: { userId: string }) {
  const q = useEmployeeAttendance(userId);
  if (q.isLoading) return <LoadingState label="Loading attendance..." />;
  if (q.isError || !q.data) return <ErrorState label="Unable to load attendance." />;

  const records = q.data.records as Array<{ date: string; status: string; clockIn?: string; clockOut?: string }>;
  if (records.length === 0) return <Card className="p-5 text-sm text-slate-500">No attendance records.</Card>;

  return (
    <Card className="p-0">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 dark:border-slate-800">
          <tr className="text-left text-xs uppercase tracking-wider text-slate-400">
            <th className="px-4 py-2">Date</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2">Clock in</th>
            <th className="px-4 py-2">Clock out</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r, i) => (
            <tr key={i} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
              <td className="px-4 py-2">{new Date(r.date).toLocaleDateString()}</td>
              <td className="px-4 py-2">{r.status}</td>
              <td className="px-4 py-2">{r.clockIn ? new Date(r.clockIn).toLocaleTimeString() : "—"}</td>
              <td className="px-4 py-2">{r.clockOut ? new Date(r.clockOut).toLocaleTimeString() : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
```

### 3.3 — Leave tab

```typescript
// apps/web/components/hr/employee/tabs/leave-tab.tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useEmployeeLeave } from "@/lib/api/employee-profile";

export function LeaveTab({ userId }: { userId: string }) {
  const q = useEmployeeLeave(userId);
  if (q.isLoading) return <LoadingState label="Loading leave..." />;
  if (q.isError || !q.data) return <ErrorState label="Unable to load leave data." />;

  const balances = q.data.balances as Array<{ id: string; leaveType: string; balance: number }>;
  const requests = q.data.requests as Array<{ id: string; leaveType: string; startDate: string; endDate: string; status: string; reason?: string }>;

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <h3 className="mb-3 font-semibold">Balances</h3>
        {balances.length === 0 ? (
          <p className="text-sm text-slate-500">No balance records.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {balances.map((b) => (
              <div key={b.id} className="rounded border border-slate-200 p-3 dark:border-slate-800">
                <div className="text-xs uppercase text-slate-400">{b.leaveType}</div>
                <div className="text-lg font-semibold">{b.balance}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card className="p-5">
        <h3 className="mb-3 font-semibold">Requests</h3>
        {requests.length === 0 ? (
          <p className="text-sm text-slate-500">No leave requests.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {requests.map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded border border-slate-100 px-3 py-2 dark:border-slate-800">
                <div>
                  <div className="text-sm font-medium">{r.leaveType}</div>
                  <div className="text-xs text-slate-500">
                    {new Date(r.startDate).toLocaleDateString()} → {new Date(r.endDate).toLocaleDateString()}
                  </div>
                </div>
                <Badge tone={r.status === "APPROVED" ? "positive" : r.status === "REJECTED" ? "destructive" : "warning"} size="sm">
                  {r.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
```

### 3.4 — Performance tab

```typescript
// apps/web/components/hr/employee/tabs/performance-tab.tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useEmployeePerformance } from "@/lib/api/employee-profile";

export function PerformanceTab({ userId }: { userId: string }) {
  const q = useEmployeePerformance(userId);
  if (q.isLoading) return <LoadingState label="Loading performance..." />;
  if (q.isError || !q.data) return <ErrorState label="Unable to load performance data." />;

  const reviews = q.data.reviews as Array<{ id: string; rating?: number; createdAt: string; reviewType?: string; comments?: string; reviewer?: { firstName: string; lastName: string } }>;
  const goals = q.data.goals as Array<{ id: string; title: string; status: string; progress?: number; targetDate?: string }>;

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <h3 className="mb-3 font-semibold">Reviews ({reviews.length})</h3>
        {reviews.length === 0 ? (
          <p className="text-sm text-slate-500">No reviews recorded.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {reviews.map((r) => (
              <li key={r.id} className="rounded border border-slate-100 p-3 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{r.reviewType ?? "Review"}</span>
                  {r.rating != null && <Badge tone="info" size="sm">{r.rating.toFixed(1)}</Badge>}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {r.reviewer ? `By ${r.reviewer.firstName} ${r.reviewer.lastName} · ` : ""}
                  {new Date(r.createdAt).toLocaleDateString()}
                </div>
                {r.comments && <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{r.comments}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="p-5">
        <h3 className="mb-3 font-semibold">Goals ({goals.length})</h3>
        {goals.length === 0 ? (
          <p className="text-sm text-slate-500">No goals set.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {goals.map((g) => (
              <li key={g.id} className="flex items-center justify-between rounded border border-slate-100 p-3 dark:border-slate-800">
                <div>
                  <div className="text-sm font-medium">{g.title}</div>
                  {g.targetDate && <div className="text-xs text-slate-500">Due {new Date(g.targetDate).toLocaleDateString()}</div>}
                </div>
                <Badge tone={g.status === "COMPLETED" ? "positive" : "warning"} size="sm">{g.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 1-4: Create the four tab files above**

- [ ] **Step 5: Wire all four into the page**

In `apps/web/app/(dashboard)/hr/employees/[userId]/page.tsx`, replace the tab body region:

```typescript
import { OverviewTab } from "@/components/hr/employee/tabs/overview-tab";
import { AttendanceTab } from "@/components/hr/employee/tabs/attendance-tab";
import { LeaveTab } from "@/components/hr/employee/tabs/leave-tab";
import { PerformanceTab } from "@/components/hr/employee/tabs/performance-tab";

// in JSX:
{activeTab === "overview" && <OverviewTab employee={employee} />}
{activeTab === "attendance" && <AttendanceTab userId={userId} />}
{activeTab === "leave" && <LeaveTab userId={userId} />}
{activeTab === "performance" && <PerformanceTab userId={userId} />}
```

- [ ] **Step 6: Verify + commit**

```bash
cd /Users/nifal/Documents/nuro/apps/web && npx tsc --noEmit
git add apps/web/components/hr/employee apps/web/app/\(dashboard\)/hr/employees
git commit -m "feat(hr): overview / attendance / leave / performance tab components"
```

---

## Task 4: Tabs (payroll, career, projects, documents)

### 4.1 — Payroll tab

```typescript
// apps/web/components/hr/employee/tabs/payroll-tab.tsx
"use client";

import { Card } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useEmployeePayroll } from "@/lib/api/employee-profile";
import { formatCurrency } from "@/lib/utils";

export function PayrollTab({ userId }: { userId: string }) {
  const q = useEmployeePayroll(userId);
  if (q.isLoading) return <LoadingState label="Loading payroll..." />;
  if (q.isError || !q.data) return <ErrorState label="Unable to load payroll data." />;

  const ss = q.data.salaryStructure as { basic?: number; hra?: number; specialAllowance?: number; pfDeduction?: number; taxDeduction?: number; effectiveFrom?: string } | null;
  const slips = q.data.paySlips as Array<{ id: string; month: number; year: number; grossSalary: number; netSalary: number; status: string; paidAt?: string }>;

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <h3 className="mb-3 font-semibold">Salary structure</h3>
        {ss ? (
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            {(["basic","hra","specialAllowance","pfDeduction","taxDeduction"] as const).map((k) => (
              <div key={k}>
                <dt className="text-xs uppercase text-slate-400">{k}</dt>
                <dd className="font-medium">{ss[k] != null ? formatCurrency(Number(ss[k])) : "—"}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-slate-500">No salary structure recorded.</p>
        )}
      </Card>
      <Card className="p-0">
        <h3 className="px-5 pt-5 font-semibold">Pay slips</h3>
        {slips.length === 0 ? (
          <p className="px-5 py-3 text-sm text-slate-500">No pay slips.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 dark:border-slate-800">
              <tr className="text-left text-xs uppercase tracking-wider text-slate-400">
                <th className="px-4 py-2">Period</th>
                <th className="px-4 py-2">Gross</th>
                <th className="px-4 py-2">Net</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {slips.map((s) => (
                <tr key={s.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                  <td className="px-4 py-2">{s.month}/{s.year}</td>
                  <td className="px-4 py-2">{formatCurrency(Number(s.grossSalary))}</td>
                  <td className="px-4 py-2">{formatCurrency(Number(s.netSalary))}</td>
                  <td className="px-4 py-2">{s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
```

### 4.2 — Career tab

Includes a "+ Log career event" button (HR-only) that opens a small dialog; the dialog calls `useAddCareerEvent`.

```typescript
// apps/web/components/hr/employee/tabs/career-tab.tsx
"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useEmployeeCareer } from "@/lib/api/employee-profile";
import { useAuthStore } from "@/lib/store/auth-store";
import { CareerEventDialog } from "@/components/hr/employee/career-event-dialog";

const HR_ROLES = ["SUPER_ADMIN", "ADMIN", "HR_MANAGER"];

export function CareerTab({ userId }: { userId: string }) {
  const q = useEmployeeCareer(userId);
  const [open, setOpen] = useState(false);
  const isHr = useAuthStore((s) => (s.user?.roles ?? []).some((r) => HR_ROLES.includes(r)));

  if (q.isLoading) return <LoadingState label="Loading career history..." />;
  if (q.isError || !q.data) return <ErrorState label="Unable to load career data." />;

  const entries = q.data.entries;

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold">Career & status events</h3>
        {isHr && <Button size="sm" onClick={() => setOpen(true)}>+ Log event</Button>}
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-slate-500">No events recorded.</p>
      ) : (
        <ol className="border-l border-slate-200 pl-4 dark:border-slate-800">
          {entries.map((e) => (
            <li key={`${e.kind}-${e.id}`} className="relative mb-4 last:mb-0">
              <div className="absolute -left-[19px] mt-1 h-3 w-3 rounded-full bg-blue-500" />
              <div className="flex items-baseline gap-2">
                <Badge tone="neutral" size="xs">{e.kind}</Badge>
                <span className="text-xs text-slate-400">{new Date(e.effectiveDate).toLocaleDateString()}</span>
              </div>
              <div className="mt-1 text-sm font-medium">{e.summary}</div>
              {e.details && <div className="mt-1 text-xs text-slate-500">{e.details}</div>}
            </li>
          ))}
        </ol>
      )}
      <CareerEventDialog userId={userId} open={open} onOpenChange={setOpen} />
    </Card>
  );
}
```

`CareerEventDialog`:

```typescript
// apps/web/components/hr/employee/career-event-dialog.tsx
"use client";

import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useAddCareerEvent } from "@/lib/api/employee-profile";

const TYPES = [
  { value: "PROMOTED", label: "Promoted" },
  { value: "TRANSFERRED", label: "Transferred" },
  { value: "SALARY_CHANGE", label: "Salary change" },
  { value: "TERMINATED", label: "Terminated" },
  { value: "REJOINED", label: "Rejoined" },
];

export function CareerEventDialog({ userId, open, onOpenChange }: { userId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const m = useAddCareerEvent(userId);
  const [type, setType] = useState("PROMOTED");
  const [fromValue, setFromValue] = useState("");
  const [toValue, setToValue] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");

  const submit = () => {
    m.mutate(
      { type, fromValue: fromValue || undefined, toValue: toValue || undefined, effectiveDate, reason: reason || undefined },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Log career event</DialogTitle>
          <DialogDescription>Record a promotion, transfer, salary change, or status change.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Type</label>
            <Select value={type} onValueChange={setType} options={TYPES} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">From</label>
              <Input value={fromValue} onChange={(e) => setFromValue(e.target.value)} placeholder="e.g. Engineer" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">To</label>
              <Input value={toValue} onChange={(e) => setToValue(e.target.value)} placeholder="e.g. Senior Engineer" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Effective date</label>
            <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Reason (optional)</label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={m.isPending}>{m.isPending ? "Saving..." : "Log event"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### 4.3 — Projects tab

```typescript
// apps/web/components/hr/employee/tabs/projects-tab.tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useEmployeeProjects } from "@/lib/api/employee-profile";

export function ProjectsTab({ userId }: { userId: string }) {
  const q = useEmployeeProjects(userId);
  if (q.isLoading) return <LoadingState label="Loading projects..." />;
  if (q.isError || !q.data) return <ErrorState label="Unable to load project data." />;

  const projects = q.data.projects as Array<{ id: string; name: string; status: string; role: "MEMBER" | "MANAGER"; startDate?: string; endDate?: string }>;
  const tasks = q.data.openTasks as Array<{ id: string; title: string; status: string; dueDate?: string; project?: { name: string } }>;

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <h3 className="mb-3 font-semibold">Projects ({projects.length}) · {q.data.completedTaskCount} completed tasks</h3>
        {projects.length === 0 ? (
          <p className="text-sm text-slate-500">No projects.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {projects.map((p) => (
              <li key={`${p.id}-${p.role}`} className="flex items-center justify-between rounded border border-slate-100 p-3 dark:border-slate-800">
                <div>
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="text-xs text-slate-500">{p.status}</div>
                </div>
                <Badge tone={p.role === "MANAGER" ? "info" : "neutral"} size="sm">{p.role}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="p-5">
        <h3 className="mb-3 font-semibold">Open tasks ({tasks.length})</h3>
        {tasks.length === 0 ? (
          <p className="text-sm text-slate-500">No open tasks.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {tasks.map((t) => (
              <li key={t.id} className="flex items-center justify-between rounded border border-slate-100 p-3 dark:border-slate-800">
                <div>
                  <div className="text-sm font-medium">{t.title}</div>
                  {t.project && <div className="text-xs text-slate-500">{t.project.name}</div>}
                </div>
                <div className="flex items-center gap-2">
                  {t.dueDate && <span className="text-xs text-slate-500">{new Date(t.dueDate).toLocaleDateString()}</span>}
                  <Badge tone="warning" size="sm">{t.status}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
```

### 4.4 — Documents tab (read-only)

```typescript
// apps/web/components/hr/employee/tabs/documents-tab.tsx
"use client";

import { Card } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useEmployeeDocuments } from "@/lib/api/employee-profile";

export function DocumentsTab({ userId }: { userId: string }) {
  const q = useEmployeeDocuments(userId);
  if (q.isLoading) return <LoadingState label="Loading documents..." />;
  if (q.isError || !q.data) return <ErrorState label="Unable to load documents." />;

  const docs = q.data.documents as Array<{ id: string; title: string; fileUrl: string; createdAt: string }>;

  return (
    <Card className="p-5">
      <h3 className="mb-3 font-semibold">Documents ({docs.length})</h3>
      {docs.length === 0 ? (
        <p className="text-sm text-slate-500">No documents uploaded. (Upload UI ships in Plan 2C.)</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between rounded border border-slate-100 p-3 dark:border-slate-800">
              <div>
                <a href={d.fileUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-blue-700 hover:underline dark:text-blue-400">
                  {d.title}
                </a>
                <div className="text-xs text-slate-500">{new Date(d.createdAt).toLocaleDateString()}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
```

- [ ] **Step 1: Create all four tab files above**

- [ ] **Step 2: Create `career-event-dialog.tsx`**

- [ ] **Step 3: Wire into the page**

```typescript
import { PayrollTab } from "@/components/hr/employee/tabs/payroll-tab";
import { CareerTab } from "@/components/hr/employee/tabs/career-tab";
import { ProjectsTab } from "@/components/hr/employee/tabs/projects-tab";
import { DocumentsTab } from "@/components/hr/employee/tabs/documents-tab";

{activeTab === "payroll" && <PayrollTab userId={userId} />}
{activeTab === "career" && <CareerTab userId={userId} />}
{activeTab === "projects" && <ProjectsTab userId={userId} />}
{activeTab === "documents" && <DocumentsTab userId={userId} />}
```

- [ ] **Step 4: Verify + commit**

```bash
cd /Users/nifal/Documents/nuro/apps/web && npx tsc --noEmit
git add apps/web/components/hr/employee apps/web/app/\(dashboard\)/hr/employees
git commit -m "feat(hr): payroll / career / projects / documents tab components + career-event dialog"
```

---

## Task 5: Tabs (assets, onboarding, timeline, notes)

### 5.1 — Assets tab

```typescript
// apps/web/components/hr/employee/tabs/assets-tab.tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useEmployeeAssets } from "@/lib/api/employee-profile";

export function AssetsTab({ userId }: { userId: string }) {
  const q = useEmployeeAssets(userId);
  if (q.isLoading) return <LoadingState label="Loading assets..." />;
  if (q.isError || !q.data) return <ErrorState label="Unable to load assets." />;

  const assets = q.data.assets as Array<{ id: string; name: string; category: string; serialNumber?: string; assignedAt?: string; status: string }>;

  return (
    <Card className="p-5">
      <h3 className="mb-3 font-semibold">Assigned assets ({assets.length})</h3>
      {assets.length === 0 ? (
        <p className="text-sm text-slate-500">No assets assigned.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {assets.map((a) => (
            <li key={a.id} className="flex items-center justify-between rounded border border-slate-100 p-3 dark:border-slate-800">
              <div>
                <div className="text-sm font-medium">{a.name}</div>
                <div className="text-xs text-slate-500">
                  {a.category}
                  {a.serialNumber ? ` · SN ${a.serialNumber}` : ""}
                  {a.assignedAt ? ` · since ${new Date(a.assignedAt).toLocaleDateString()}` : ""}
                </div>
              </div>
              <Badge tone="info" size="sm">{a.status}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
```

### 5.2 — Onboarding tab

```typescript
// apps/web/components/hr/employee/tabs/onboarding-tab.tsx
"use client";

import { Card } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useEmployeeOnboarding } from "@/lib/api/employee-profile";

export function OnboardingTab({ userId }: { userId: string }) {
  const q = useEmployeeOnboarding(userId);
  if (q.isLoading) return <LoadingState label="Loading onboarding..." />;
  if (q.isError || !q.data) return <ErrorState label="Unable to load onboarding." />;

  const checklists = q.data.checklists as Array<{
    id: string; title: string; description: string | null;
    items: Array<{ id: string; title: string; completed: boolean }>
  }>;

  if (checklists.length === 0) {
    return <Card className="p-5 text-sm text-slate-500">No onboarding checklist assigned.</Card>;
  }

  return (
    <div className="flex flex-col gap-4">
      {checklists.map((cl) => {
        const total = cl.items.length;
        const done = cl.items.filter((i) => i.completed).length;
        return (
          <Card key={cl.id} className="p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{cl.title}</h3>
              <span className="text-xs text-slate-500">{done}/{total}</span>
            </div>
            {cl.description && <p className="mt-1 text-sm text-slate-500">{cl.description}</p>}
            <ul className="mt-3 flex flex-col gap-1">
              {cl.items.map((it) => (
                <li key={it.id} className="flex items-center gap-2 text-sm">
                  <span className={it.completed ? "text-emerald-600" : "text-slate-400"}>{it.completed ? "✓" : "○"}</span>
                  <span className={it.completed ? "line-through text-slate-400" : "text-slate-700 dark:text-slate-300"}>{it.title}</span>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
```

### 5.3 — Timeline tab

```typescript
// apps/web/components/hr/employee/tabs/timeline-tab.tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useEmployeeTimeline } from "@/lib/api/employee-profile";

export function TimelineTab({ userId }: { userId: string }) {
  const q = useEmployeeTimeline(userId);
  if (q.isLoading) return <LoadingState label="Loading timeline..." />;
  if (q.isError || !q.data) return <ErrorState label="Unable to load timeline." />;

  const entries = q.data.entries;

  return (
    <Card className="p-5">
      <h3 className="mb-4 font-semibold">Activity timeline</h3>
      {entries.length === 0 ? (
        <p className="text-sm text-slate-500">No activity recorded.</p>
      ) : (
        <ol className="border-l border-slate-200 pl-4 dark:border-slate-800">
          {entries.map((e) => (
            <li key={`${e.kind}-${e.id}`} className="relative mb-4 last:mb-0">
              <div className="absolute -left-[19px] mt-1 h-2.5 w-2.5 rounded-full bg-slate-400" />
              <div className="flex items-baseline gap-2">
                <Badge tone="neutral" size="xs">{e.kind}</Badge>
                <span className="text-xs text-slate-400">{new Date(e.at).toLocaleString()}</span>
              </div>
              <div className="mt-1 text-sm">{e.summary}</div>
              {e.details && <div className="mt-1 text-xs text-slate-500">{e.details}</div>}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
```

### 5.4 — Notes tab (HR-only) with inline form

```typescript
// apps/web/components/hr/employee/tabs/notes-tab.tsx
"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useEmployeeNotes, useAddHrNote, useDeleteHrNote } from "@/lib/api/employee-profile";

const CATEGORIES = [
  { value: "GENERAL", label: "General" },
  { value: "KUDOS", label: "Kudos" },
  { value: "DISCIPLINARY", label: "Disciplinary" },
  { value: "ACCOMMODATION", label: "Accommodation" },
];

export function NotesTab({ userId }: { userId: string }) {
  const q = useEmployeeNotes(userId);
  const add = useAddHrNote(userId);
  const del = useDeleteHrNote(userId);

  const [body, setBody] = useState("");
  const [category, setCategory] = useState("GENERAL");

  const submit = () => {
    if (!body.trim()) return;
    add.mutate({ body: body.trim(), category }, { onSuccess: () => setBody("") });
  };

  if (q.isLoading) return <LoadingState label="Loading notes..." />;
  if (q.isError || !q.data) return <ErrorState label="Unable to load notes." />;

  const notes = q.data.notes;

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <h3 className="mb-3 font-semibold">Add note</h3>
        <div className="flex flex-col gap-2">
          <Select value={category} onValueChange={setCategory} options={CATEGORIES} />
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a private HR note..." rows={3} />
          <Button onClick={submit} disabled={add.isPending || !body.trim()} className="self-end">
            {add.isPending ? "Adding..." : "Add note"}
          </Button>
        </div>
      </Card>
      <Card className="p-5">
        <h3 className="mb-3 font-semibold">Notes ({notes.length})</h3>
        {notes.length === 0 ? (
          <p className="text-sm text-slate-500">No notes recorded.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {notes.map((n) => (
              <li key={n.id} className="rounded border border-slate-100 p-3 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge tone="neutral" size="xs">{n.category}</Badge>
                    <span className="text-xs text-slate-500">
                      by {n.author.firstName} {n.author.lastName} · {new Date(n.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => del.mutate(n.id)} disabled={del.isPending}>
                    Delete
                  </Button>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{n.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
```

If `Textarea` doesn't exist (it does — `apps/web/components/ui/textarea.tsx`), use a plain `<textarea>` with the same styling classes as `Input`.

- [ ] **Step 1: Create the four tab files above**

- [ ] **Step 2: Wire into the page**

```typescript
import { AssetsTab } from "@/components/hr/employee/tabs/assets-tab";
import { OnboardingTab } from "@/components/hr/employee/tabs/onboarding-tab";
import { TimelineTab } from "@/components/hr/employee/tabs/timeline-tab";
import { NotesTab } from "@/components/hr/employee/tabs/notes-tab";

{activeTab === "assets" && <AssetsTab userId={userId} />}
{activeTab === "onboarding" && <OnboardingTab userId={userId} />}
{activeTab === "timeline" && <TimelineTab userId={userId} />}
{activeTab === "notes" && <NotesTab userId={userId} />}
```

- [ ] **Step 3: Verify + commit**

```bash
cd /Users/nifal/Documents/nuro/apps/web && npx tsc --noEmit
git add apps/web/components/hr/employee apps/web/app/\(dashboard\)/hr/employees
git commit -m "feat(hr): assets / onboarding / timeline / notes tab components"
```

---

## Task 6: Self-service link from `/profile`

**File:** `apps/web/app/(dashboard)/profile/page.tsx` (modify)

Add a prominent button or card at the top linking to `/hr/employees/me`. Read the existing file first to find a good spot.

```typescript
import Link from "next/link";
import { Button } from "@/components/ui/button";

// Somewhere near the top of the page's main content:
<Link href="/hr/employees/me" className="inline-block">
  <Button variant="secondary">View my full HR profile →</Button>
</Link>
```

- [ ] **Step 1: Read the existing `/profile` page to find a good insertion point**

```bash
head -50 /Users/nifal/Documents/nuro/apps/web/app/\(dashboard\)/profile/page.tsx
```

- [ ] **Step 2: Add the link near the page header**

- [ ] **Step 3: Verify + commit**

```bash
cd /Users/nifal/Documents/nuro/apps/web && npx tsc --noEmit
git add apps/web/app/\(dashboard\)/profile
git commit -m "feat(hr): link from /profile to /hr/employees/me"
```

---

## Task 7: End-to-end smoke test

- [ ] **Step 1: Boot API + web (in two background tasks)**

```bash
cd /Users/nifal/Documents/nuro
npm run dev:api &  # background
sleep 12
npm run dev:web &  # background
sleep 8
```

- [ ] **Step 2: Hit the page and confirm it returns HTML**

```bash
curl -s -o /tmp/p.html -w "HTTP %{http_code}\n" http://localhost:3000/hr/employees/me
```

Expected: HTTP 200 (the page renders the auth-loading shell since cookies aren't carried; that's fine — we just need to confirm no compile errors).

- [ ] **Step 3: Check that the Next chunk for the page exists**

```bash
grep -o "apps_web_app_(dashboard)_hr_employees" /tmp/p.html | head -1
```

Expected: at least one match — confirms the route was server-rendered.

- [ ] **Step 4: Manual browser test (do this yourself)**

Open `http://localhost:3000/login` in a browser. Log in as `hr@nuro7.com` / `ChangeMe123!`. Navigate to `/hr` and click any employee card. The detail page should load with header, quick stats, all 12 tabs visible. Click each tab to confirm data loads.

Then log in as `engineer@nuro7.com` / `ChangeMe123!`, go to `/hr/employees/me`, and confirm only the Overview tab is visible (peer view of self should hide payroll, notes, etc. per the matrix — actually, since `/me` resolves to Self for the engineer, you'd see most tabs but not payroll/notes; verify.)

- [ ] **Step 5: Stop servers**

```bash
pkill -f "next dev" 2>&1
pkill -f "nest start" 2>&1
```

No commit for the smoke test itself.

---

## What's done at the end of this plan

✅ Page route `/hr/employees/[userId]` with header, quick-stats, 12 tabs, URL-synced active tab.
✅ Header shows the right info, plus HR-only "Resend invite" button when status === INVITED.
✅ Quick-stats render based on what the masked DTO contains (peers see fewer chips).
✅ All 12 tab components consume their endpoints and render appropriate data or empty states.
✅ Career tab includes "+ Log event" dialog for HR.
✅ Notes tab has inline create form + delete button per note.
✅ Self-service link from `/profile` → `/hr/employees/me`.
✅ Employee directory cards on `/hr` link into the detail page.

## What's NOT in this plan

- **Document upload/delete UI.** Deferred to Plan 2C (requires a backend endpoint that doesn't exist yet plus a multer-aware multipart form).
- **Inline manager-approval of leave requests** from the Leave tab. Deferred — same Approve flow lives on the HR Hub in Plan 3.
- **Edit profile dialog** beyond the existing `EmployeeEditDialog`. The detail page only shows data; editing salary/department happens via the existing dialog from `/hr`.
