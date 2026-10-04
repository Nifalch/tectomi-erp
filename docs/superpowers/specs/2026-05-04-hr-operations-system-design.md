# HR Operations System — Design

**Date:** 2026-05-04
**Status:** Spec, awaiting implementation plan
**Scope:** Add Employee flow + Employee 360° detail page + HR Operations Hub

## Problem

The Nuro7 platform has many HR-related modules (attendance, leave, payroll, performance, onboarding, holidays, shifts, assets, goals) with data and pages, but no unified HR operational system. Specifically:

1. There is no way to **add a new employee** through the UI. The HR module only edits existing users.
2. There is no **per-employee detail view**. Clicking on an employee in the directory does nothing — managers and HR cannot see one person's full history in one place.
3. The HR landing page (`/hr`) is a directory + a few charts. It is not an operational hub: there is no approvals queue, no alerts, no celebrations, no onboarding/offboarding queues, no quick actions.

Goal: build a complete HR operational system that closes these gaps.

## Goals

- HR can add new employees end-to-end through the UI in a single short form.
- Anyone with access can click an employee name and see a full 360° profile with 12 tabs covering everything tracked about that person.
- HR has a single landing page that surfaces what needs attention today (approvals, alerts, celebrations, queues) and exposes quick actions.
- Permissions are enforced server-side, layered by role and relationship to the target employee.

## Non-goals

- Recruitment / applicant tracking (separate future module).
- Training programs / certifications / disciplinary workflows beyond simple HR notes (separate future module).
- CSV bulk import of employees (out of scope; user picked single-step form).
- Org-chart-as-page-builder advanced visualization (we ship a basic tree).
- Self-service payroll viewing (employees see overview but not full payslip history; can be added later).

## Architectural approach

**Orchestrator + delegation.** The HR module owns its own controller, service, hub aggregator, employee CRUD, and a per-employee detail aggregator. Sub-domain logic stays in the existing modules (`attendance`, `leave`, `payroll`, `performance-reviews`, `goals`, `assets`, `onboarding`, `tasks`, `documents`, `activities`, etc.). The HR service calls those services rather than re-querying their tables.

This fits the existing NestJS structure (one module per domain), keeps files focused, and avoids logic duplication. The trade-off is more inter-module wiring, which we manage by exposing thin per-user query helpers on each domain service (`forUser(userId, options)`).

## Data model

### Existing models reused (no change)
`User`, `EmployeeProfile`, `EmployeeDocument`, `PromotionHistory`, `SalaryStructure`, `PaySlip`, `Attendance`, `LeaveRequest`, `LeaveBalance`, `PerformanceReview`, `Goal`, `Asset` (already has `assignedToId` → `User`), `OnboardingChecklist`, `OnboardingItem`, `ActivityLog`, `UserRole`.

### Schema additions

**1. Manager relation on `EmployeeProfile`**

`EmployeeProfile.managerName: String?` is currently a free-text field. Replace with a foreign key:

```prisma
model EmployeeProfile {
  // ... existing fields ...
  managerId  String?
  manager    User?   @relation("EmployeeManager", fields: [managerId], references: [id], onDelete: SetNull)
  // managerName kept as fallback for legacy data; new writes use managerId
}

model User {
  // ... existing relations ...
  directReports EmployeeProfile[] @relation("EmployeeManager")
}
```

**Why:** powers the org chart, "direct reports" filter for managers, and permission checks (manager-of-X gates).

**Migration:** new column added nullable; backfill is a no-op (`managerName` text values stay where they are; HR can re-link via UI). Old `managerName` stays in the schema as a soft-deprecated free-text fallback — display logic prefers `manager.firstName + lastName` and falls back to `managerName` when `managerId` is null.

**2. `HrNote` model** (HR-only private notes)

```prisma
model HrNote {
  id          String          @id @default(cuid())
  employeeId  String
  employee    EmployeeProfile @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  authorId    String
  author      User            @relation("HrNoteAuthor", fields: [authorId], references: [id], onDelete: Restrict)
  category    HrNoteCategory
  body        String
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt
}

enum HrNoteCategory {
  KUDOS
  DISCIPLINARY
  ACCOMMODATION
  GENERAL
}
```

**3. `EmploymentStatusEvent` model**

Single source of truth for the activity timeline (Tab 11) and the Career tab (Tab 6).

```prisma
model EmploymentStatusEvent {
  id            String              @id @default(cuid())
  employeeId    String
  employee      EmployeeProfile     @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  type          EmploymentEventType
  fromValue     String?
  toValue       String?
  effectiveDate DateTime            @db.Date
  reason        String?
  createdById   String
  createdBy     User                @relation("EmploymentEventCreator", fields: [createdById], references: [id], onDelete: Restrict)
  createdAt     DateTime            @default(now())
}

enum EmploymentEventType {
  HIRED
  PROMOTED
  TRANSFERRED
  SALARY_CHANGE
  TERMINATED
  REJOINED
}
```

**4. `terminatedAt` on `EmployeeProfile`**

```prisma
terminatedAt  DateTime?  @db.Date
```

Distinguishes active from former employees without deleting records (preserves history). Used for the directory's "Active / Terminated" filter and triggers asset auto-release on termination.

## API surface

All under `/hr/*`. RBAC enforced via existing `@Roles` decorator + a new `HrPermissionsService` that determines viewer level and relationship.

### HR Hub
- `GET /hr/hub` — single payload for the landing page: KPIs, pending approvals, alerts, celebrations, onboarding queue, upcoming reviews, charts data, directory snapshot (top N), org-chart preview, available quick-actions.

### Directory & search
- `GET /hr/employees?search=&department=&role=&status=&managerId=&employmentType=&active=&page=&pageSize=` — paginated employee list.
- `GET /hr/org-chart` — full reporting tree.

### Employee CRUD & lifecycle (HR-only)
- `POST /hr/employees` — create User + EmployeeProfile + UserRole rows + optional onboarding checklist clone in one transaction; sends invite email.
- `PATCH /hr/employees/:userId` — update profile (existing endpoint, kept; permission-aware field masking on salary/hourlyRate).
- `POST /hr/employees/:userId/resend-invite` — resend invite if status is `INVITED`.
- `POST /hr/employees/:userId/terminate` — sets `terminatedAt`, deactivates user, logs `EmploymentStatusEvent(type=TERMINATED)`, releases assigned assets (sets `Asset.status = AVAILABLE`, `assignedToId = null`).
- `POST /hr/employees/:userId/career-events` — log promotion/transfer/salary-change → writes `EmploymentStatusEvent` and updates `EmployeeProfile`.

### Employee 360° — root + lazy tab endpoints

All accept `:userId` or the literal `me` alias (resolves to `req.user.id`).

- `GET /hr/employees/:userId` — identity + Overview tab payload (loads on page mount).
- `GET /hr/employees/:userId/attendance?from=&to=` — Tab 2.
- `GET /hr/employees/:userId/leave` — Tab 3.
- `GET /hr/employees/:userId/performance` — Tab 4.
- `GET /hr/employees/:userId/payroll` — Tab 5 (HR/Finance only).
- `GET /hr/employees/:userId/career` — Tab 6 (`PromotionHistory` + `EmploymentStatusEvent` merged).
- `GET /hr/employees/:userId/projects` — Tab 7 (active + completed projects, assigned tasks).
- `GET /hr/employees/:userId/documents` + `POST .../documents` upload — Tab 8.
- `GET /hr/employees/:userId/assets` — Tab 9.
- `GET /hr/employees/:userId/onboarding` — Tab 10.
- `GET /hr/employees/:userId/timeline?cursor=&limit=` — Tab 11 (paginated chronological merge of status events, leaves, reviews, promotions, project assignments, doc uploads).
- `GET /hr/employees/:userId/notes` + `POST .../notes` + `DELETE .../notes/:id` — Tab 12 (HR-only).

### Permission helper

`HrPermissionsService` exposes:
- `viewerLevel(user) → 'HR' | 'FINANCE' | 'MANAGER' | 'PEER'`
- `relationshipTo(viewer, targetUserId) → 'SELF' | 'DIRECT_REPORT' | 'OTHER'`
- `canAccessTab(viewer, target, tabKey) → boolean`
- `maskOverview(viewer, target, fullProfile) → MaskedProfileDto`
- `assertCanWriteAction(viewer, target, action) throws`

## Frontend (Next.js App Router)

### Routes
- `/hr` — HR Hub (rebuild of existing page).
- `/hr/employees` — searchable directory.
- `/hr/employees/[userId]` — Employee 360° detail page (`userId = "me"` resolves to current user).
- `/hr/org-chart` — reporting tree visualization.

### HR Hub page (`/hr`)

```
<ModuleHeader />              ← module title + KPI counts (existing pattern)
<QuickActionsBar />           ← + Add Employee, Run Payroll, Approve Leaves, Schedule Review, Export
<KpiStrip />                  ← 6 stat cards
<ApprovalsQueue + AlertsPanel /> ← two-col grid
<Celebrations + OnboardingQueue /> ← two-col grid
<UpcomingReviews />
<WorkforceCharts />           ← 4 charts (donut, headcount trend, leave trend, attendance)
<DirectorySnapshot />         ← top 8 employees + "View all →" link to /hr/employees
<OrgChartPreview />           ← compact preview, link to /hr/org-chart
```

Approve/reject from `<ApprovalsQueue>` runs inline via existing leave/expense mutations.

### Directory page (`/hr/employees`)

- Filter sidebar: department, role, employment type, active/terminated, manager.
- Search box (debounced, name + email).
- Result view: card grid (current pattern) with table-toggle for dense view.
- Click any card → `/hr/employees/[userId]`.

### Employee 360° page (`/hr/employees/[userId]`)

```
<EmployeeHeader />            ← photo, name, role, dept, manager, contact,
                                 status, tenure pill,
                                 [Edit] [Terminate] [Resend invite] (gated)
<EmployeeQuickStats />        ← 4 chips: leave balance, attendance %, perf score, active projects
<TabBar />                    ← 12 tabs; tabs the viewer can't access are hidden
<TabContent />                ← lazy-loads via TanStack Query when activated;
                                 URL-synced with ?tab=performance for deep links
```

Tab components live in `apps/web/components/hr/employee/tabs/`:
- `overview-tab.tsx` (loaded with page)
- `attendance-tab.tsx`, `leave-tab.tsx`, `performance-tab.tsx`, `payroll-tab.tsx`, `career-tab.tsx`, `projects-tab.tsx`, `documents-tab.tsx`, `assets-tab.tsx`, `onboarding-tab.tsx`, `timeline-tab.tsx`, `notes-tab.tsx` (lazy)

### Add Employee dialog

`<AddEmployeeDialog />` opened from any quick-action button. Single-step form:
- Personal: first name, last name, email, phone, avatar.
- Employment: department, designation, employment type, join date, manager (User picker).
- Compensation: salary, hourly rate (optional).
- Access: role(s) checkboxes.
- Onboarding: optional "Send onboarding checklist" toggle with template picker.

On submit: `useCreateEmployee()` → toast → router pushes to `/hr/employees/[newUserId]`.

### Self-service

`/hr/employees/me` resolves to current user. Tabs the viewer cannot access are hidden by `canAccessTab` (the same rule the server enforces). A "My Details" link is added to `/profile` for discoverability.

### Hooks (`apps/web/lib/api/hooks/hr.ts`)

Queries: `useHrHub()`, `useHrEmployees(filters)`, `useOrgChart()`, `useEmployeeProfile(userId)`, plus one per tab: `useEmployeeAttendance`, `useEmployeeLeave`, `useEmployeePerformance`, `useEmployeePayroll`, `useEmployeeCareer`, `useEmployeeProjects`, `useEmployeeDocuments`, `useEmployeeAssets`, `useEmployeeOnboarding`, `useEmployeeTimeline`, `useEmployeeNotes`.

Mutations: `useCreateEmployee`, `useUpdateEmployee`, `useTerminateEmployee`, `useResendInvite`, `useAddCareerEvent`, `useUploadEmployeeDoc`, `useDeleteEmployeeDoc`, `useAddHrNote`, `useDeleteHrNote`.

### Component organization

```
apps/web/components/hr/
  hub/                              ← 10 widget components, one per file
    quick-actions-bar.tsx
    kpi-strip.tsx
    approvals-queue.tsx
    alerts-panel.tsx
    celebrations.tsx
    onboarding-queue.tsx
    upcoming-reviews.tsx
    workforce-charts.tsx
    directory-snapshot.tsx
    org-chart-preview.tsx
  employee/
    employee-header.tsx
    employee-quick-stats.tsx
    employee-tab-bar.tsx
    tabs/                           ← 12 tab components
  add-employee-dialog.tsx
  employee-edit-dialog.tsx          ← existing, kept
  terminate-employee-dialog.tsx
  career-event-dialog.tsx
  hr-note-form.tsx
  org-chart/
    org-tree.tsx
    org-node.tsx
```

## Permissions matrix

Roles map to viewer levels:
- `SUPER_ADMIN`, `ADMIN`, `HR_MANAGER` → **HR**
- `FINANCE_MANAGER` → **Finance**
- All other authenticated users → **Peer**
- Viewer === target → **Self** (overrides peer/manager)

The **Manager** level is relationship-based, not role-based. Viewer is treated as Manager *for a specific target* if any of:
- Target's `EmployeeProfile.managerId === viewer.id`, OR
- Viewer has the `PROJECT_MANAGER` role and is the manager of a `Project` that has the target as a member (via `Project.managerId` and `ProjectMember.userId`).

So the same viewer can be Manager for one employee and Peer for another. The HR and Finance levels apply globally.

### Tab access

| Tab | Self | Manager (own reports) | HR | Finance | Peer |
|---|---|---|---|---|---|
| 1. Overview | full | full | full + edit | full | public fields only* |
| 2. Attendance | yes | yes | yes | yes | no |
| 3. Leave | yes | yes | yes + approve | no | no |
| 4. Performance | read | read + write reviews | read + write | no | no |
| 5. Payroll & Compensation | no** | no | yes + edit | yes (read) | no |
| 6. Career & Promotions | yes | yes | yes + log events | yes | no |
| 7. Projects & Tasks | yes | yes | yes | no | no |
| 8. Documents | own only | no | yes + upload/delete | no | no |
| 9. Assets | yes | yes | yes + assign | no | no |
| 10. Onboarding | yes + check items | yes (assign items) | yes + edit | no | no |
| 11. Activity timeline | yes | yes (filtered) | full | work-only | no |
| 12. HR Notes | no | no | yes + write/delete | no | no |

\* **Public fields:** name, photo, designation, department, work email, work phone. Hidden: salary, hourly rate, manager name, emergency contact, performance score, personal phone, date of birth, terminated status.

\** Self can see own salary/hourly rate on the Overview quick-stats but the full Payroll tab (payslip history, salary structure changes) stays HR/Finance-only.

### Field-level masking on Overview & Directory
- `salary`, `hourlyRate`: HR + Finance + Self only.
- `emergencyContact`, `personalPhone`, `dateOfBirth`: HR + Self only.
- `performanceScore`: Self + Manager + HR only.
- `terminatedAt`: HR + Manager + Self only (peers see "no longer with company" placeholder).

### Action gates
- `+ Add Employee`, `Terminate`, `Resend invite`, `Log career event`, `Edit profile (any field)`, `Add/Delete HR note`, `Upload/Delete document` → HR only.
- `Approve leave` → HR + Manager-of-requester.
- `Edit own profile` (limited) → Self can edit `phone`, `emergencyContact`, `avatarUrl` only.
- `Run payroll` → Finance + HR.
- `Write performance review` → HR + Manager-of-target.

## Build sequence

Five phases, each a working slice that can be merged independently.

### Phase 1 — Foundation
1. Prisma schema additions: `managerId` FK, `HrNote`, `EmploymentStatusEvent`, `terminatedAt`.
2. Generate + run migration; update seed data.
3. Build `HrPermissionsService` + field-masking helper. Unit tests.

**Done when:** schema migrated, seed runs, permission helper covered by tests.

### Phase 2 — Add Employee flow
1. `POST /hr/employees` endpoint (transactional User + EmployeeProfile + UserRole + optional onboarding clone; invite email).
2. `AddEmployeeDialog` component + `useCreateEmployee()` hook.
3. Wire "+ Add Employee" button into existing `/hr` page (rest of page unchanged for now).

**Done when:** HR can add a new employee end-to-end through the UI; new user receives invite.

### Phase 3 — Employee 360° detail page (largest)
1. Backend: `GET /hr/employees/:userId` + 11 per-tab endpoints, all permission-masked through `HrPermissionsService`.
2. Backend: action endpoints (`POST .../career-events`, `POST/DELETE .../notes`, `POST/DELETE .../documents`, `POST .../resend-invite`).
3. Frontend route `/hr/employees/[userId]` with header, quick stats, tab bar shell, `me` alias.
4. 12 tab components (parallelizable in two waves of 6).
5. Self-service link on `/profile` page.

**Done when:** clicking any employee opens a working 12-tab detail page; permissions enforced; self-service `/me` works.

### Phase 4 — HR Operations Hub rebuild
1. Backend: `GET /hr/hub` aggregator.
2. Frontend: rebuild `/hr` with all 10 widgets (KPI strip, quick actions, approvals queue, alerts panel, celebrations, onboarding queue, upcoming reviews, charts, directory snapshot, org-chart preview).
3. Inline approve/reject mutations on `<ApprovalsQueue>`.

**Done when:** `/hr` is a working operational landing page with live data in every widget.

### Phase 5 — Org chart, offboarding, directory
1. `GET /hr/org-chart` + `/hr/org-chart` page (recursive tree).
2. `POST /hr/employees/:userId/terminate` + `<TerminateEmployeeDialog>` + asset auto-release.
3. `/hr/employees` directory page with filters, search, view toggle.

**Done when:** org chart visible, offboarding flow works, directory page with filters live.

### Verification at each phase
- Type-check + lint clean.
- Smoke-test the new flow in the browser as: an HR user, a manager (with reports), a peer, the employee themselves. Confirm tab visibility and field masking match the matrix.
- Backend permission rules covered by unit tests.

## Resolved decisions (for the record)

- **Onboarding checklist on Add Employee:** optional toggle with template picker, default off. HR decides per hire.
- **Activity timeline sources (Phase 3):** ships with `EmploymentStatusEvent` + `LeaveRequest` + `PerformanceReview` + `PromotionHistory` + `EmployeeDocument` uploads. Project-assignment events come from `ActivityLog` filtered by `userId` if those entries already exist; otherwise deferred to a follow-up.
- **CSV bulk import:** out of scope for this build.
- **Org chart visualization:** ships in Phase 5 as a basic recursive tree. Advanced layouts (drag-to-reorganize, zoom/pan, search-within-tree) are follow-ups.
