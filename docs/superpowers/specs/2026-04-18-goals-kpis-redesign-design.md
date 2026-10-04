# Goals & KPIs Page Redesign

**Status:** Approved — ready for implementation plan
**Scope:** Visual redesign of `/goals` page only. No schema, API, or permission changes.

## Goal

Replace the current data-table-only view of `/goals` with a scannable, presentable card-grid dashboard that surfaces progress at a glance and groups items by type (KPI / OKR / GOAL). The existing CRUD, permission, and enum work is already shipped; this spec covers only the view layer.

## Non-goals

- No changes to `GoalsService`, `GoalsController`, Prisma schema, or the `GoalType` / `GoalStatus` enums.
- No changes to ownership enforcement (service-layer `assertCanMutate` + row `hidden` predicate already gate edit/delete correctly).
- No new endpoints; the existing `useGoals()` payload carries every field the new UI needs.
- No redesign of the create/edit dialog — it stays as-is.

## Page structure

Top-to-bottom, within the existing `ListPageLayout`:

1. **Hero stat tiles** — 4-column gradient tiles showing counts derived client-side from the goals list. Aligned to the actual `GoalStatus` enum (`NOT_STARTED | IN_PROGRESS | COMPLETED | CANCELLED`):
   - In Progress (blue) — `status === "IN_PROGRESS"`
   - Not Started (slate) — `status === "NOT_STARTED"`
   - Completed (green) — `status === "COMPLETED"`
   - Total (orange) — count of non-cancelled goals
2. **Filter row** — pill tab group (All / Mine / In progress / Completed) on the left, search input on the right. "Mine" filters to `assigneeId === currentUser.id`. Existing `DataTable` search is replaced by this input.
3. **Three typed sections** stacked vertically, each rendered only if it contains goals:
   - **KPI** — orange accent bar + section header + card grid
   - **OKR** — blue accent bar
   - **GOAL** — green accent bar
4. **Empty state** — if there are zero goals, show the existing `ListPageLayout` empty state instead of sections.

## Card design (Glass / Luxe)

Each goal renders as a card in a 3-column responsive grid (3 cols ≥1280px, 2 cols ≥768px, 1 col below). Card contents, top to bottom:

- **Type tag** — small uppercase label with a colored dot matching the section accent.
- **Status chip** — colored pill mapping the real enum: `NOT_STARTED` → slate "Not started", `IN_PROGRESS` → blue "In progress", `COMPLETED` → green "Completed", `CANCELLED` → grey "Cancelled". Chip color scheme lives alongside the new section colors.
- **Title** — `row.title`, 15px semibold.
- **Percentage** — large 36px bold number, computed as `Math.round(currentValue / targetValue * 100)` with the existing zero-divide guard.
- **Sub-unit line** — `{currentValue} / {targetValue} {unit}` (e.g. "72k / 100k USD").
- **Progress bar** — 8px height, gradient fill matching the section color (orange for KPI, blue for OKR, green for GOAL).
- **Footer** — gradient avatar circle with first initial + assignee full name on the left, due date on the right (formatted as existing `toLocaleDateString()`).

Click anywhere on the card → opens the Edit dialog (only if `canMutate(row)` is true; otherwise the card is read-only, no hover lift).

## Visual treatment

Uses tokens already in `apps/web/app/globals.css`:

- Background: `--background` (warm cream / dark inversion in dark mode).
- Type accent colors come from existing tokens — primary (orange), accent (blue), success (green).
- Glass card: `backdrop-filter: blur(10px)` over a translucent white (`rgba(255,255,255,.55)`) in light mode and translucent slate in dark mode. Border uses `rgba(255,255,255,.8)` light / subtle slate dark.
- Gradient progress bars composed from the same tokens.

All new styling is Tailwind utility classes plus a small local `<style>` block for the conic/linear gradients and backdrop-filter — same pattern the rest of `(dashboard)/*` pages follow.

## Data flow

No new hooks, no new endpoints. The one `useGoals()` list already returns every field this UI needs:

- `id`, `title`, `type`, `status`, `targetValue`, `currentValue`, `unit`, `dueDate`, `assigneeId`, `assignee.firstName`, `assignee.lastName`.

Filters + sections are pure client-side derivations on the same array. Hero tile counts are `useMemo`'d off the same array.

## Component reuse

- `ListPageLayout` — keep the outer chrome (breadcrumb, title, description, primary action, counts badges).
- `Button`, `Badge`, `Input`, `Dialog`, `ConfirmDialog`, `FormField`, `Select`, `DatePicker` — unchanged, reused in the dialog.
- `DataTable`, `createActionsColumn`, `RowAction` — **removed from this page**. Edit/Delete move to a small dropdown menu on each card (same `DropdownMenu` primitive, same `hidden: (row) => !canMutate(row)` predicate).
- `useAuthStore`, `useGoals`, `useMutation` flows — unchanged.

## File scope

One file changes for the view, one new subcomponent file to keep the page file readable:

- **Modify:** [apps/web/app/(dashboard)/goals/page.tsx](apps/web/app/(dashboard)/goals/page.tsx) — swap the `<DataTable>` body for hero-tiles + filter row + typed sections. Keep all state, mutations, dialog, and permission logic untouched.
- **New:** `apps/web/app/(dashboard)/goals/_components/goal-card.tsx` — presentational card + its dropdown actions. Keeping this out of `page.tsx` so the page file stays focused on data/state.

Optional small helper (inline unless it grows): `_components/hero-tiles.tsx` and `_components/filter-bar.tsx` if the inlined JSX creeps past ~60 lines each. Otherwise keep inline.

## Behavior details

- **Filters are additive with search**: pill selection and search narrow the same list before sectioning.
- **Section visibility**: a section header only renders when that type has ≥1 goal after filters. Filter pills apply across all types (sections still group by type).
- **Accessibility**: cards are `<button>` elements when clickable, `<div role="article">` when read-only. Status is announced via the chip text, not color alone.
- **Dark mode**: tokens already invert; verify the glass card's translucent surface remains legible on `--background` dark (`222 39% 8%`).

## Out of scope (already flagged in previous plan)

These stay untouched by this redesign:

- `statusTone` map referencing values the DB never emits.
- The always-zero "active" count in the `ListPageLayout` counts prop (will be superseded by the new hero tiles, so the counts prop can drop to just `total`).
- DTO validation on the API side.
- Tests.

## Verification plan

1. **Type-check + build**: `cd apps/web && npx tsc --noEmit` — no regressions.
2. **Visual check** via preview or local dev:
   - Empty state renders when no goals exist.
   - Hero tile counts match the actual list.
   - Sectioning: create one KPI, one OKR, one GOAL → three sections appear.
   - Filter pills: "Mine" hides goals assigned to other users; "In progress" shows only `IN_PROGRESS`; "Completed" shows only `COMPLETED`.
   - Search narrows within whatever pill is active.
   - Admin sees Edit/Delete on every card; employee sees the dropdown only on their own cards; read-only cards have no dropdown and no hover lift.
   - Click card → Edit dialog opens with prefilled values; Save → list updates; Delete → removes the card; `canMutate=false` card has no click affordance.
3. **Dark mode**: toggle theme → glass cards remain legible, gradients still readable.
4. **Responsive**: resize to 1024 → 2 cols; 700 → 1 col. No horizontal scroll.
