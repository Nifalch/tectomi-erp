# Goals & KPIs Page Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the data-table view of `/goals` with a glass-luxe card-grid dashboard (hero tiles + filter pills + three typed sections) while keeping all existing CRUD, permissions, and dialog logic untouched.

**Architecture:** Single page file holds data + mutations + dialog; a new `_components/goal-card.tsx` holds the presentational card (with its own dropdown menu for Edit/Delete). Hero tiles and filter bar are inlined in `page.tsx` unless they grow past ~60 lines. All visuals use existing CSS tokens from `apps/web/app/globals.css` + Tailwind utilities. No new endpoints, no new hooks.

**Tech Stack:** Next.js 14 (app router), React, TypeScript, Tailwind CSS, Radix primitives (`DropdownMenu`, `Dialog`), TanStack Query, Zustand (`useAuthStore`), lucide-react icons.

**Project note:** The repo is not under git, and `apps/web` has no frontend test framework. This plan therefore:
- Skips `git commit` / branch steps. "Checkpoint" means "save files and verify the app still compiles/renders."
- Skips unit tests for the redesigned page (matches existing codebase pattern and the spec's verification plan). Verification is type-check + visual check after each task.

---

## File structure

- **Modify:** [apps/web/app/(dashboard)/goals/page.tsx](apps/web/app/(dashboard)/goals/page.tsx) — swap DataTable body for hero tiles + filter row + typed sections. Keep all state, mutations, dialog, permission logic.
- **Create:** `apps/web/app/(dashboard)/goals/_components/goal-card.tsx` — presentational glass card with its own dropdown actions.
- **Create:** `apps/web/app/(dashboard)/goals/_components/goal-visuals.css` — small local stylesheet for the glass blur, gradient progress bars, and conic rings. Imported from `page.tsx`. (Tailwind doesn't express `backdrop-filter` gradients cleanly; a scoped CSS file keeps `page.tsx` readable and avoids polluting global styles.)

No other files in the repo need changes. `GoalsService`, `goals.controller.ts`, the Prisma schema, `useGoals`, `useAuthStore`, `DropdownMenu`, `Dialog`, `ListPageLayout`, and the create/edit form all stay as-is.

---

## Task 1: Scaffold `goal-visuals.css` with the glass + gradient primitives

**Files:**
- Create: `apps/web/app/(dashboard)/goals/_components/goal-visuals.css`

- [ ] **Step 1: Create the stylesheet**

Create `apps/web/app/(dashboard)/goals/_components/goal-visuals.css` with:

```css
/* Scoped to .goals-surface descendants so nothing leaks. */

.goals-surface .glass-card {
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  background: rgba(255, 255, 255, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.8);
  box-shadow:
    0 8px 24px rgba(20, 28, 44, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
  border-radius: 20px;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.goals-surface .glass-card.is-clickable {
  cursor: pointer;
}

.goals-surface .glass-card.is-clickable:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 28px rgba(20, 28, 44, 0.1);
}

.dark .goals-surface .glass-card {
  background: rgba(30, 41, 59, 0.55);
  border: 1px solid rgba(148, 163, 184, 0.18);
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.25),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

/* Gradient progress bars — one per type. */
.goals-surface .progress-rail {
  height: 8px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.18);
  overflow: hidden;
}

.goals-surface .progress-fill {
  height: 100%;
  border-radius: 999px;
}

.goals-surface .progress-fill.kpi {
  background: linear-gradient(90deg, hsl(16 87% 53%), hsl(39 97% 55%));
}
.goals-surface .progress-fill.okr {
  background: linear-gradient(90deg, hsl(201 95% 42%), hsl(199 89% 58%));
}
.goals-surface .progress-fill.goal {
  background: linear-gradient(90deg, hsl(146 67% 40%), hsl(142 71% 55%));
}

/* Gradient hero tiles. */
.goals-surface .hero-tile {
  border-radius: 14px;
  padding: 14px 16px;
  color: white;
  position: relative;
  overflow: hidden;
}
.goals-surface .hero-tile::before {
  content: "";
  position: absolute;
  top: -30px;
  right: -30px;
  width: 90px;
  height: 90px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
}
.goals-surface .hero-tile .label {
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-weight: 600;
  opacity: 0.9;
}
.goals-surface .hero-tile .num {
  font-size: 28px;
  font-weight: 800;
  line-height: 1.1;
  margin-top: 4px;
}

.goals-surface .hero-tile.in-progress {
  background: linear-gradient(135deg, hsl(201 95% 42%), hsl(199 89% 58%));
}
.goals-surface .hero-tile.not-started {
  background: linear-gradient(135deg, hsl(215 25% 45%), hsl(215 20% 60%));
}
.goals-surface .hero-tile.completed {
  background: linear-gradient(135deg, hsl(146 67% 40%), hsl(142 71% 55%));
}
.goals-surface .hero-tile.total {
  background: linear-gradient(135deg, hsl(16 87% 53%), hsl(25 95% 58%));
}

/* Type accent bar used above section headers. */
.goals-surface .section-accent {
  height: 3px;
  width: 32px;
  border-radius: 999px;
  display: inline-block;
}
.goals-surface .section-accent.kpi  { background: hsl(16 87% 53%); }
.goals-surface .section-accent.okr  { background: hsl(201 95% 42%); }
.goals-surface .section-accent.goal { background: hsl(146 67% 40%); }

/* Avatar dot for card footer. */
.goals-surface .assignee-avatar {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: linear-gradient(135deg, hsl(16 87% 53%), hsl(39 97% 55%));
  color: white;
  font-size: 10px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
```

- [ ] **Step 2: Verify the file saved and the web app still builds**

Run: `cd /Users/nifal/Documents/nuro/apps/web && npx tsc --noEmit`
Expected: no new errors. (The CSS isn't imported yet, so nothing should have changed compilation-wise.)

---

## Task 2: Create `GoalCard` component shell

**Files:**
- Create: `apps/web/app/(dashboard)/goals/_components/goal-card.tsx`

- [ ] **Step 1: Create the card component file**

Create `apps/web/app/(dashboard)/goals/_components/goal-card.tsx` with the full implementation below. This is the entire file — no placeholders.

```tsx
"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type GoalCardType = "KPI" | "OKR" | "GOAL";
export type GoalCardStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface GoalCardData {
  id: string;
  title: string;
  type: GoalCardType;
  status: GoalCardStatus;
  targetValue: number;
  currentValue: number;
  unit?: string;
  dueDate?: string;
  assignee?: { firstName: string; lastName: string };
}

interface GoalCardProps {
  goal: GoalCardData;
  canMutate: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

const statusStyles: Record<GoalCardStatus, { label: string; className: string }> = {
  NOT_STARTED: { label: "Not started", className: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200" },
  IN_PROGRESS: { label: "In progress", className: "bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-200" },
  COMPLETED: { label: "Completed", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200" },
  CANCELLED: { label: "Cancelled", className: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" },
};

const typeDotColor: Record<GoalCardType, string> = {
  KPI: "bg-orange-500",
  OKR: "bg-sky-600",
  GOAL: "bg-emerald-600",
};

function formatUnit(current: number, target: number, unit?: string) {
  const u = unit ? ` ${unit}` : "";
  return `${current} / ${target}${u}`;
}

function initial(name?: { firstName: string; lastName: string }) {
  return name?.firstName?.[0]?.toUpperCase() ?? "?";
}

function assigneeName(name?: { firstName: string; lastName: string }) {
  if (!name) return "Unassigned";
  return `${name.firstName} ${name.lastName}`.trim();
}

function formatDueDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

export function GoalCard({ goal, canMutate, onEdit, onDelete }: GoalCardProps) {
  const pct = goal.targetValue > 0
    ? Math.min(100, Math.round((goal.currentValue / goal.targetValue) * 100))
    : 0;
  const typeClass = goal.type.toLowerCase() as "kpi" | "okr" | "goal";
  const status = statusStyles[goal.status];

  const handleCardClick = () => {
    if (canMutate) onEdit();
  };

  const handleCardKey = (e: React.KeyboardEvent) => {
    if (!canMutate) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onEdit();
    }
  };

  return (
    <div
      role={canMutate ? "button" : "article"}
      tabIndex={canMutate ? 0 : -1}
      onClick={canMutate ? handleCardClick : undefined}
      onKeyDown={canMutate ? handleCardKey : undefined}
      className={`glass-card p-5 flex flex-col gap-3 ${canMutate ? "is-clickable" : ""}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${typeDotColor[goal.type]}`} />
          <span className="text-[10px] font-semibold tracking-[0.12em] text-slate-500 dark:text-slate-400">
            {goal.type}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${status.className}`}>
            {status.label}
          </span>
          {canMutate && (
            <DropdownMenu>
              <DropdownMenuTrigger
                onClick={(e) => e.stopPropagation()}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Open actions"
              >
                <MoreHorizontal className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={(e) => { e.stopPropagation(); onEdit(); }}
                >
                  <Pencil className="size-4" /> Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  destructive
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                >
                  <Trash2 className="size-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <h3 className="text-[15px] font-semibold leading-snug text-slate-900 dark:text-slate-100">
        {goal.title}
      </h3>

      <div>
        <div className="flex items-baseline gap-1">
          <span className="text-[34px] font-extrabold leading-none text-slate-900 dark:text-slate-100 tracking-tight">
            {pct}
          </span>
          <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">%</span>
        </div>
        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {formatUnit(goal.currentValue, goal.targetValue, goal.unit)}
        </div>
      </div>

      <div className="progress-rail">
        <div className={`progress-fill ${typeClass}`} style={{ width: `${pct}%` }} />
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1">
        <span className="flex items-center gap-2">
          <span className="assignee-avatar">{initial(goal.assignee)}</span>
          <span>{assigneeName(goal.assignee)}</span>
        </span>
        <span>{formatDueDate(goal.dueDate)}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd /Users/nifal/Documents/nuro/apps/web && npx tsc --noEmit`
Expected: no errors. (The component is exported but not yet imported anywhere.)

---

## Task 3: Wire up state derivations (no UI yet) in `page.tsx`

**Files:**
- Modify: [apps/web/app/(dashboard)/goals/page.tsx](apps/web/app/(dashboard)/goals/page.tsx)

The current page returns `<ListPageLayout>…<DataTable/>…dialog…</ListPageLayout>`. This task adds filter state and derived lists alongside the existing code (without replacing the DataTable yet), so we can verify the derivations before tearing the table out.

- [ ] **Step 1: Add filter state and `useMemo` derivations**

Open `apps/web/app/(dashboard)/goals/page.tsx`. The current file has `const goals = toArray<GoalRow>(query.data);` right after the loading/error checks (around line 125). Add the following code **immediately after** that line:

```tsx
  const [filterPill, setFilterPill] = useState<"all" | "mine" | "in_progress" | "completed">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const counts = useMemo(() => ({
    inProgress: goals.filter((g) => g.status === "IN_PROGRESS").length,
    notStarted: goals.filter((g) => g.status === "NOT_STARTED").length,
    completed: goals.filter((g) => g.status === "COMPLETED").length,
    total: goals.filter((g) => g.status !== "CANCELLED").length,
  }), [goals]);

  const filteredGoals = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return goals.filter((g) => {
      if (filterPill === "mine" && g.assigneeId !== currentUser?.id) return false;
      if (filterPill === "in_progress" && g.status !== "IN_PROGRESS") return false;
      if (filterPill === "completed" && g.status !== "COMPLETED") return false;
      if (q && !g.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [goals, filterPill, searchQuery, currentUser?.id]);

  const sections: Array<{ type: "KPI" | "OKR" | "GOAL"; items: GoalRow[] }> = useMemo(() => {
    return [
      { type: "KPI",  items: filteredGoals.filter((g) => g.type === "KPI") },
      { type: "OKR",  items: filteredGoals.filter((g) => g.type === "OKR") },
      { type: "GOAL", items: filteredGoals.filter((g) => g.type === "GOAL") },
    ];
  }, [filteredGoals]);
```

- [ ] **Step 2: Add the missing imports**

Find the `import { useEffect, useState } from "react";` line near the top (line 3). Replace it with:

```tsx
import { useEffect, useMemo, useState } from "react";
```

- [ ] **Step 3: Type-check and run the app**

Run: `cd /Users/nifal/Documents/nuro/apps/web && npx tsc --noEmit`
Expected: no errors. The page still renders the DataTable; the new derivations are computed but unused. No visual change yet.

If you have the dev server running, load `/goals` in the browser. Expected: identical to before — the DataTable still renders, no layout shift, no console errors.

---

## Task 4: Replace the DataTable body with hero tiles + filter row + section scaffolds

**Files:**
- Modify: [apps/web/app/(dashboard)/goals/page.tsx](apps/web/app/(dashboard)/goals/page.tsx)

Now swap the visual body. After this task, the page layout is done but the cards are still empty placeholders — cards come in Task 5.

- [ ] **Step 1: Add the CSS import and `GoalCard` import**

At the top of `apps/web/app/(dashboard)/goals/page.tsx`, **after the last `import` line**, add:

```tsx
import { GoalCard } from "./_components/goal-card";
import "./_components/goal-visuals.css";
```

- [ ] **Step 2: Remove the `columns` definition and `DataTable` render**

Find the block that starts with `const columns: ColumnDef<GoalRow, unknown>[] = [` (around line 147) and ends with the closing `];` after `createActionsColumn(rowActions),`. **Delete the entire `columns` array.**

Also delete the `DataTable` import at the top (`import { DataTable } from "@/components/ui/data-table";`) and the `ColumnDef` import (`import type { ColumnDef } from "@tanstack/react-table";`). These are no longer used.

- [ ] **Step 3: Replace the `<DataTable …/>` JSX with the new layout**

Find the JSX line `<DataTable columns={columns} data={goals} searchPlaceholder="Search goals..." emptyState={{ title: "No goals", description: "Create your first goal to start tracking." }} />`. Replace that single line with the following JSX block:

```tsx
      <div className="goals-surface space-y-6">
        {/* Hero tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="hero-tile in-progress">
            <div className="label">In Progress</div>
            <div className="num">{counts.inProgress}</div>
          </div>
          <div className="hero-tile not-started">
            <div className="label">Not Started</div>
            <div className="num">{counts.notStarted}</div>
          </div>
          <div className="hero-tile completed">
            <div className="label">Completed</div>
            <div className="num">{counts.completed}</div>
          </div>
          <div className="hero-tile total">
            <div className="label">Total</div>
            <div className="num">{counts.total}</div>
          </div>
        </div>

        {/* Filter + search */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {([
              { id: "all", label: "All" },
              { id: "mine", label: "Mine" },
              { id: "in_progress", label: "In progress" },
              { id: "completed", label: "Completed" },
            ] as const).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setFilterPill(p.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  filterPill === p.id
                    ? "bg-orange-500 text-white shadow-sm"
                    : "bg-white/70 text-slate-600 hover:bg-white dark:bg-slate-800/70 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="sm:w-72">
            <Input
              placeholder="Search goals..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Empty state */}
        {filteredGoals.length === 0 && (
          <div className="glass-card p-10 text-center">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {goals.length === 0 ? "No goals yet" : "No goals match your filters"}
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {goals.length === 0
                ? "Create your first goal to start tracking."
                : "Try a different filter or clear the search."}
            </p>
          </div>
        )}

        {/* Sections — cards go in next task */}
        {sections.map((section) => (
          section.items.length > 0 && (
            <section key={section.type} className="space-y-3">
              <div className="flex items-center gap-2">
                <span className={`section-accent ${section.type.toLowerCase()}`} />
                <h2 className="text-sm font-semibold tracking-wide text-slate-700 dark:text-slate-200">
                  {section.type} <span className="text-slate-400 font-medium">· {section.items.length}</span>
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {/* Cards will be added in Task 5 */}
                {section.items.map((g) => (
                  <div key={g.id} className="glass-card p-5 text-xs text-slate-400">
                    {g.title} (card stub)
                  </div>
                ))}
              </div>
            </section>
          )
        ))}
      </div>
```

- [ ] **Step 4: Drop the stale `counts` prop entries on `ListPageLayout`**

Find the `counts={[ … ]}` prop passed to `<ListPageLayout>` (around line 192). Replace the whole `counts={…}` prop with:

```tsx
      counts={[
        { label: "total", value: goals.length },
      ]}
```

(Per the spec, the old "active" count referenced a legacy status that the DB never emits. The hero tiles carry the real counts now; keeping `total` for the header badge.)

- [ ] **Step 5: Type-check and render**

Run: `cd /Users/nifal/Documents/nuro/apps/web && npx tsc --noEmit`
Expected: no errors.

Load `/goals` in the browser. Expected:
- Hero row shows 4 gradient tiles with real counts.
- Pill row shows All / Mine / In progress / Completed (All selected, orange).
- Search input renders on the right.
- Each type with ≥1 goal shows a section with an accent bar + count + a grid of stub cards showing only the title.
- Dialog and primary "New Goal" button still work.

If no goals exist, the empty state card appears instead of sections.

---

## Task 5: Render real `GoalCard` components inside sections

**Files:**
- Modify: [apps/web/app/(dashboard)/goals/page.tsx](apps/web/app/(dashboard)/goals/page.tsx)

- [ ] **Step 1: Replace the stub card JSX with `GoalCard`**

In `page.tsx`, find the card stub from Task 4:

```tsx
                {section.items.map((g) => (
                  <div key={g.id} className="glass-card p-5 text-xs text-slate-400">
                    {g.title} (card stub)
                  </div>
                ))}
```

Replace it with:

```tsx
                {section.items.map((g) => (
                  <GoalCard
                    key={g.id}
                    goal={{
                      id: g.id,
                      title: g.title,
                      type: g.type as "KPI" | "OKR" | "GOAL",
                      status: g.status as "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED",
                      targetValue: g.targetValue,
                      currentValue: g.currentValue,
                      unit: g.unit,
                      dueDate: g.dueDate,
                      assignee: g.assignee,
                    }}
                    canMutate={canMutate(g)}
                    onEdit={() => { setEditGoal(g); setCreateOpen(true); }}
                    onDelete={() => setDeleteTarget(g)}
                  />
                ))}
```

- [ ] **Step 2: Remove the now-unused `rowActions` array and `createActionsColumn` / `RowAction` imports**

Find and delete:
- The import line `import { createActionsColumn, type RowAction } from "@/components/ui/data-table-row-actions";` (no longer used after Task 4 dropped `columns`).
- The `const rowActions: RowAction<GoalRow>[] = [ … ];` block (around line 127).
- The now-unused `Pencil` and `Trash2` imports from `lucide-react` **only if they are used nowhere else in the file**. Leave `Plus` (used by the primary action). If they're still referenced, keep them.

- [ ] **Step 3: Type-check**

Run: `cd /Users/nifal/Documents/nuro/apps/web && npx tsc --noEmit`
Expected: no errors. If there's an "unused variable" warning for `rowActions`, it means Step 2 missed a reference — delete it.

- [ ] **Step 4: Visual check**

Load `/goals` in the browser. Expected:
- Each section now shows real glass cards with: type tag + colored dot, status chip, title, big percentage, sub-unit line, gradient progress bar, avatar + assignee + due date.
- Progress bar color matches section (orange for KPI, blue for OKR, green for GOAL).
- Clicking a card where `canMutate(goal)` is true opens the Edit dialog pre-filled.
- Clicking the three-dots menu on a card shows Edit + Delete; the Edit dropdown item and a card click both route to the same edit dialog.
- Cards where `canMutate(goal)` is false have no dropdown, no hover lift, no click affordance.

---

## Task 6: End-to-end verification

**Files:** None.

- [ ] **Step 1: Type-check the full web workspace**

Run: `cd /Users/nifal/Documents/nuro/apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Empty-state check**

With a user who has no goals (or filter to impossible state), load `/goals`. Expected: the empty glass card message renders and no section headers appear.

- [ ] **Step 3: Sectioning check**

As admin, create one KPI, one OKR, one GOAL. Expected: three sections appear, each with one card, in the order KPI → OKR → GOAL.

- [ ] **Step 4: Filter + search check**

- Click "Mine" — only goals assigned to the logged-in user remain, sections hide if empty.
- Click "In progress" — only `IN_PROGRESS` cards remain.
- Click "Completed" — only `COMPLETED` cards remain.
- With a filter active, type part of a goal title into the search box — list narrows further. Clear the search → full filter view returns.
- Click "All" → all goals reappear.

- [ ] **Step 5: Permissions check**

Log in as a non-admin employee. Expected:
- Cards for goals assigned to someone else: no dropdown, no hover lift, click does nothing.
- Cards assigned to the employee: dropdown visible, click opens Edit dialog.

- [ ] **Step 6: CRUD round-trip check**

- Click a card → Edit dialog opens with prefilled values → change `currentValue` → Save → toast "Goal updated" → card percentage updates immediately without reload.
- Click dropdown → Delete → confirm → toast "Goal deleted" → card disappears, hero tile counts decrement.
- Click "+ New Goal" header button → Create dialog → fill → Create → toast "Goal created" → new card appears in its section, hero tile counts increment.

- [ ] **Step 7: Dark mode check**

Toggle the app theme. Expected: glass cards remain legible on the dark background, hero tiles keep their gradients, progress bars remain readable, status chips have enough contrast.

- [ ] **Step 8: Responsive check**

Resize the browser:
- ≥1280px: 3 cards per section row.
- 768–1280px: 2 cards per section row.
- <768px: 1 card per row; hero tiles become 2×2; filter pills wrap.
- No horizontal scrollbar at any width.

- [ ] **Step 9: Checkpoint**

Save all files. The implementation is complete.

---

## Out of scope (per spec — not touched here)

- Legacy `statusTone` map (the page no longer uses it after Task 5; if it's orphaned, deleting its declaration during Task 5 cleanup is fine, but **don't** retool it).
- DTO validation on the API (`@Body() dto: any` stays).
- Frontend test framework setup.
- The existing create/edit dialog layout and form fields.
