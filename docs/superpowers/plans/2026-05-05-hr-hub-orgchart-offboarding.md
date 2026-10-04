# HR Operations Hub + Org Chart + Offboarding + Directory Implementation Plan (Plan 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the final pieces of the HR operational system — a rebuild of `/hr` as an operations hub, an org-chart visualization, an offboarding (terminate) flow with asset auto-release, and a searchable directory page.

**Architecture:** One new aggregator endpoint `GET /hr/hub` returns every widget's data in one payload. The org chart is a recursive tree from `EmployeeProfile.managerId`. Termination is transactional (sets `terminatedAt`, deactivates user, logs `EmploymentStatusEvent(TERMINATED)`, releases assets). Directory is a thin filter+paginate wrapper.

**Tech Stack:** NestJS 11, Prisma 6 (schema additions from Plan 1), `HrPermissionsService`, Next.js App Router, TanStack Query, the `EmployeeProfileService` facade from Plan 2A for the directory endpoint.

**Spec:** [docs/superpowers/specs/2026-05-04-hr-operations-system-design.md](../specs/2026-05-04-hr-operations-system-design.md)

**Depends on:** Plan 1 (foundation), Plan 2A (API), Plan 2B (UI).

**Verification model:** type-check + lint + curl smoke tests for endpoints + browser HTTP 200 + clean Next compile for pages.

**Project working directory:** `/Users/nifal/Documents/nuro`

**Trim from spec:** Celebrations widget shows **work anniversaries only** (no birthdays — `User.dateOfBirth` doesn't exist in the schema and adding it is out of scope). When/if a `dateOfBirth` field is added later, the Celebrations widget can be extended.

---

## File map

**API (new files):**
- `apps/api/src/modules/hr/hub/hub.service.ts` — aggregator
- `apps/api/src/modules/hr/hub/hub.controller.ts` — `GET /hr/hub`, `GET /hr/org-chart`
- `apps/api/src/modules/hr/hub/hub.types.ts` — DTO shapes (the hub returns a single composite object; explicit types help)

**API (modify):**
- `apps/api/src/modules/hr/hr.module.ts` — provide HubService, register HubController
- `apps/api/src/modules/hr/employee-profile/employee-profile.service.ts` — add `terminate` and `listDirectory` methods
- `apps/api/src/modules/hr/employee-profile/employee-profile.controller.ts` — add `POST :userId/terminate` and `GET /` (directory)

**Web (new files):**
- `apps/web/lib/api/hr-hub.ts` — typed hooks for hub + org-chart + directory + terminate
- `apps/web/components/hr/hub/quick-actions-bar.tsx`
- `apps/web/components/hr/hub/kpi-strip.tsx`
- `apps/web/components/hr/hub/approvals-queue.tsx`
- `apps/web/components/hr/hub/alerts-panel.tsx`
- `apps/web/components/hr/hub/celebrations.tsx`
- `apps/web/components/hr/hub/onboarding-queue.tsx`
- `apps/web/components/hr/hub/upcoming-reviews.tsx`
- `apps/web/components/hr/hub/directory-snapshot.tsx`
- `apps/web/components/hr/hub/org-chart-preview.tsx`
- `apps/web/components/hr/employee/terminate-employee-dialog.tsx`
- `apps/web/components/hr/org-chart/org-tree.tsx`
- `apps/web/components/hr/org-chart/org-node.tsx`
- `apps/web/app/(dashboard)/hr/employees/page.tsx` — directory page
- `apps/web/app/(dashboard)/hr/org-chart/page.tsx` — org chart page

**Web (rebuild):**
- `apps/web/app/(dashboard)/hr/page.tsx` — replace the existing implementation with the hub composition

---

## Task 1: API — `GET /hr/hub` aggregator

**Files:**
- Create: `apps/api/src/modules/hr/hub/hub.types.ts`
- Create: `apps/api/src/modules/hr/hub/hub.service.ts`
- Create: `apps/api/src/modules/hr/hub/hub.controller.ts`
- Modify: `apps/api/src/modules/hr/hr.module.ts`

- [ ] **Step 1: Create the types file**

```typescript
// apps/api/src/modules/hr/hub/hub.types.ts
export interface HubKpis {
  headcount: number;
  newHiresThisMonth: number;
  attritionThisQuarter: number;
  averageTenureYears: number;
  openPositions: number;       // placeholder — surfaced as 0 unless a "positions" table exists
  payrollCostMtd: number;
}

export interface HubAlert {
  id: string;
  kind: "LATE_ARRIVAL_TODAY" | "LOW_ATTENDANCE" | "PROBATION_ENDING_SOON" | "CONTRACT_EXPIRING";
  userId: string;
  userName: string;
  detail: string;
  severity: "info" | "warning" | "destructive";
}

export interface HubAnniversary {
  userId: string;
  userName: string;
  joinDate: string;
  yearsAt: number;     // tenure on the celebration date (1, 5, 10, ...)
  daysAway: number;    // 0..7 — how many days from today
}

export interface HubOnboardingItem {
  userId: string;
  userName: string;
  checklistTitle: string;
  doneCount: number;
  totalCount: number;
  startedAt: string;
}

export interface HubReviewItem {
  reviewId: string;
  userId: string;
  userName: string;
  reviewType: string;
  scheduledFor: string | null;
  overdue: boolean;
}

export interface HubPendingApproval {
  kind: "LEAVE";
  id: string;
  userId: string;
  userName: string;
  summary: string;
  createdAt: string;
}

export interface HubChartData {
  departmentBreakdown: Array<{ label: string; value: number }>;
  headcountTrend: Array<{ label: string; value: number }>;     // cumulative joins, last 12 months
  leaveRequestsTrend: Array<{ label: string; value: number }>; // last 12 months
  attendanceRateThisMonth: number;                              // 0-100
}

export interface HubDirectorySnapshot {
  total: number;
  recentHires: Array<{ userId: string; userName: string; designation: string; department: string; joinDate: string }>;
}

export interface HubResponse {
  kpis: HubKpis;
  alerts: HubAlert[];
  anniversaries: HubAnniversary[];
  onboarding: HubOnboardingItem[];
  upcomingReviews: HubReviewItem[];
  pendingApprovals: HubPendingApproval[];
  charts: HubChartData;
  directorySnapshot: HubDirectorySnapshot;
}
```

- [ ] **Step 2: Create the service**

```typescript
// apps/api/src/modules/hr/hub/hub.service.ts
import { Injectable } from "@nestjs/common";
import { LeaveStatus, UserStatus } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import {
  HubAlert, HubAnniversary, HubChartData, HubDirectorySnapshot, HubKpis,
  HubOnboardingItem, HubPendingApproval, HubResponse, HubReviewItem,
} from "./hub.types";

@Injectable()
export class HubService {
  constructor(private readonly prisma: PrismaService) {}

  async getHub(): Promise<HubResponse> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfQuarter = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    const last12MonthStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    const [
      activeEmployees, terminatedThisQuarter, newHiresThisMonth,
      pendingLeaves, allEmployees, attendanceThisMonth,
      onboardingItems, upcomingReviewRows, anniversaryProfiles, recentHires, paySlipsMtd,
    ] = await this.prisma.$transaction([
      this.prisma.employeeProfile.findMany({
        where: { terminatedAt: null },
        select: { id: true, joinDate: true, department: true, designation: true, userId: true,
          user: { select: { firstName: true, lastName: true } } },
      }),
      this.prisma.employeeProfile.count({
        where: { terminatedAt: { gte: startOfQuarter } },
      }),
      this.prisma.employeeProfile.count({
        where: { joinDate: { gte: startOfMonth }, terminatedAt: null },
      }),
      this.prisma.leaveRequest.findMany({
        where: { status: LeaveStatus.PENDING },
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      this.prisma.employeeProfile.findMany({
        where: { terminatedAt: null },
        select: { id: true, department: true, joinDate: true,
          user: { select: { id: true, firstName: true, lastName: true } } },
      }),
      this.prisma.attendance.findMany({
        where: { date: { gte: startOfMonth } },
        select: { status: true, userId: true },
      }),
      this.prisma.onboardingItem.findMany({
        where: { assigneeId: { not: null } },
        include: {
          checklist: { select: { id: true, title: true } },
          assignee: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.performanceReview.findMany({
        where: { createdAt: { gte: new Date(now.getFullYear(), now.getMonth() - 1, 1) } },
        include: { employee: { select: { user: { select: { id: true, firstName: true, lastName: true } } } } },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      // Anniversary candidates — anyone with a joinDate. Filter in memory (cheap).
      this.prisma.employeeProfile.findMany({
        where: { terminatedAt: null },
        select: { joinDate: true, userId: true,
          user: { select: { firstName: true, lastName: true } } },
      }),
      this.prisma.employeeProfile.findMany({
        where: { terminatedAt: null, joinDate: { gte: new Date(now.getFullYear() - 1, now.getMonth(), 1) } },
        orderBy: { joinDate: "desc" },
        take: 5,
        select: { joinDate: true, department: true, designation: true, userId: true,
          user: { select: { firstName: true, lastName: true } } },
      }),
      this.prisma.paySlip.findMany({
        where: { createdAt: { gte: startOfMonth } },
        select: { netSalary: true },
      }),
    ]);

    // ── KPIs ──
    const headcount = activeEmployees.length;
    const totalTenureDays = activeEmployees.reduce(
      (sum, e) => sum + Math.max(0, (now.getTime() - e.joinDate.getTime()) / (1000 * 60 * 60 * 24)),
      0,
    );
    const averageTenureYears = headcount > 0 ? totalTenureDays / 365 / headcount : 0;
    const attrition = headcount + terminatedThisQuarter > 0
      ? terminatedThisQuarter / (headcount + terminatedThisQuarter)
      : 0;
    const payrollCostMtd = paySlipsMtd.reduce((s, p) => s + Number(p.netSalary), 0);
    const kpis: HubKpis = {
      headcount,
      newHiresThisMonth,
      attritionThisQuarter: Math.round(attrition * 10000) / 100,  // percent with 2 decimals
      averageTenureYears: Math.round(averageTenureYears * 10) / 10,
      openPositions: 0,  // no Position model yet
      payrollCostMtd,
    };

    // ── Alerts (late today + low attendance + probation ending) ──
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const alerts: HubAlert[] = [];

    // Late arrivals today: anyone marked LATE on today's date.
    const lateRows = await this.prisma.attendance.findMany({
      where: { date: today, status: "LATE" },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
      take: 20,
    });
    for (const r of lateRows) {
      alerts.push({
        id: `late-${r.id}`,
        kind: "LATE_ARRIVAL_TODAY",
        userId: r.userId,
        userName: `${r.user.firstName} ${r.user.lastName}`,
        detail: "Late arrival today",
        severity: "warning",
      });
    }

    // Probation ending soon: hired 80-90 days ago (assume 90-day probation).
    const probEnd = activeEmployees.filter((e) => {
      const days = (now.getTime() - e.joinDate.getTime()) / (1000 * 60 * 60 * 24);
      return days >= 80 && days <= 90;
    });
    for (const e of probEnd) {
      alerts.push({
        id: `prob-${e.id}`,
        kind: "PROBATION_ENDING_SOON",
        userId: e.userId,
        userName: `${e.user.firstName} ${e.user.lastName}`,
        detail: "Probation period ending in <10 days",
        severity: "info",
      });
    }

    // ── Anniversaries (next 7 days, milestone years 1, 3, 5, 10, 15, 20) ──
    const milestones = [1, 3, 5, 10, 15, 20];
    const anniversaries: HubAnniversary[] = [];
    for (const ep of anniversaryProfiles) {
      const j = ep.joinDate;
      // Compute next anniversary date this year.
      const nextAnniv = new Date(now.getFullYear(), j.getMonth(), j.getDate());
      if (nextAnniv < today) nextAnniv.setFullYear(nextAnniv.getFullYear() + 1);
      const daysAway = Math.round((nextAnniv.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (daysAway >= 0 && daysAway <= 7) {
        const yearsAt = nextAnniv.getFullYear() - j.getFullYear();
        if (milestones.includes(yearsAt)) {
          anniversaries.push({
            userId: ep.userId,
            userName: `${ep.user.firstName} ${ep.user.lastName}`,
            joinDate: ep.joinDate.toISOString(),
            yearsAt,
            daysAway,
          });
        }
      }
    }
    anniversaries.sort((a, b) => a.daysAway - b.daysAway);

    // ── Onboarding queue (group items by assignee + checklist) ──
    type Bucket = { userId: string; userName: string; checklistTitle: string; total: number; done: number; startedAt: Date };
    const onboardingMap = new Map<string, Bucket>();
    for (const item of onboardingItems) {
      if (!item.assignee) continue;
      const key = `${item.assignee.id}-${item.checklistId}`;
      if (!onboardingMap.has(key)) {
        onboardingMap.set(key, {
          userId: item.assignee.id,
          userName: `${item.assignee.firstName} ${item.assignee.lastName}`,
          checklistTitle: item.checklist.title,
          total: 0, done: 0,
          startedAt: item.createdAt,
        });
      }
      const b = onboardingMap.get(key)!;
      b.total += 1;
      if (item.completed) b.done += 1;
      if (item.createdAt < b.startedAt) b.startedAt = item.createdAt;
    }
    const onboarding: HubOnboardingItem[] = Array.from(onboardingMap.values())
      .filter((b) => b.done < b.total)  // only show incomplete
      .map((b) => ({
        userId: b.userId, userName: b.userName,
        checklistTitle: b.checklistTitle,
        doneCount: b.done, totalCount: b.total,
        startedAt: b.startedAt.toISOString(),
      }))
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt));

    // ── Upcoming reviews (the model has no scheduled date; surface latest reviews as "recent") ──
    const upcomingReviews: HubReviewItem[] = upcomingReviewRows.map((r) => ({
      reviewId: r.id,
      userId: r.employee.user.id,
      userName: `${r.employee.user.firstName} ${r.employee.user.lastName}`,
      reviewType: r.reviewType ?? "Review",
      scheduledFor: null,
      overdue: false,
    }));

    // ── Pending approvals (leaves) ──
    const pendingApprovals: HubPendingApproval[] = pendingLeaves.map((l) => ({
      kind: "LEAVE" as const,
      id: l.id,
      userId: l.user.id,
      userName: `${l.user.firstName} ${l.user.lastName}`,
      summary: `${l.leaveType} ${new Date(l.startDate).toLocaleDateString()} → ${new Date(l.endDate).toLocaleDateString()}`,
      createdAt: l.createdAt.toISOString(),
    }));

    // ── Charts ──
    const deptCount = new Map<string, number>();
    for (const e of allEmployees) {
      deptCount.set(e.department || "Unassigned", (deptCount.get(e.department || "Unassigned") ?? 0) + 1);
    }
    const departmentBreakdown = Array.from(deptCount.entries()).map(([label, value]) => ({ label, value }));

    const buckets: Array<{ ym: string; label: string; joins: number; leaves: number }> = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        ym: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleString("en-US", { month: "short" }),
        joins: 0, leaves: 0,
      });
    }
    const ymOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    for (const e of allEmployees) {
      const k = ymOf(e.joinDate);
      const b = buckets.find((x) => x.ym === k);
      if (b) b.joins += 1;
    }
    const allLeaves = await this.prisma.leaveRequest.findMany({
      where: { createdAt: { gte: last12MonthStart } },
      select: { createdAt: true },
    });
    for (const l of allLeaves) {
      const k = ymOf(l.createdAt);
      const b = buckets.find((x) => x.ym === k);
      if (b) b.leaves += 1;
    }
    let running = 0;
    const headcountTrend = buckets.map((b) => {
      running += b.joins;
      return { label: b.label, value: running };
    });
    const leaveRequestsTrend = buckets.map((b) => ({ label: b.label, value: b.leaves }));

    const presentStatuses = ["PRESENT", "CLOCKED_IN", "COMPLETED"];
    const total = attendanceThisMonth.length;
    const present = attendanceThisMonth.filter((a) => presentStatuses.includes(a.status)).length;
    const attendanceRateThisMonth = total > 0 ? Math.round((present / total) * 100) : 0;

    const charts: HubChartData = {
      departmentBreakdown,
      headcountTrend,
      leaveRequestsTrend,
      attendanceRateThisMonth,
    };

    // ── Directory snapshot ──
    const directorySnapshot: HubDirectorySnapshot = {
      total: headcount,
      recentHires: recentHires.map((e) => ({
        userId: e.userId,
        userName: `${e.user.firstName} ${e.user.lastName}`,
        designation: e.designation,
        department: e.department,
        joinDate: e.joinDate.toISOString(),
      })),
    };

    return {
      kpis,
      alerts,
      anniversaries,
      onboarding,
      upcomingReviews,
      pendingApprovals,
      charts,
      directorySnapshot,
    };
  }

  /** Recursive org-chart from EmployeeProfile.managerId. */
  async getOrgChart() {
    const employees = await this.prisma.employeeProfile.findMany({
      where: { terminatedAt: null },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    });
    type Node = {
      userId: string;
      name: string;
      designation: string;
      department: string;
      avatarUrl: string | null;
      reports: Node[];
    };
    const byUserId = new Map<string, Node>();
    for (const e of employees) {
      byUserId.set(e.userId, {
        userId: e.userId,
        name: `${e.user.firstName} ${e.user.lastName}`,
        designation: e.designation,
        department: e.department,
        avatarUrl: e.user.avatarUrl,
        reports: [],
      });
    }
    const roots: Node[] = [];
    for (const e of employees) {
      const node = byUserId.get(e.userId)!;
      if (e.managerId && byUserId.has(e.managerId)) {
        byUserId.get(e.managerId)!.reports.push(node);
      } else {
        roots.push(node);
      }
    }
    return { roots };
  }
}
```

The `attendance.findMany({ where: { date: today, status: "LATE" } })` requires the `AttendanceStatus` enum to include `LATE`. Quickly grep:

```bash
grep -n "enum AttendanceStatus" -A 10 /Users/nifal/Documents/nuro/packages/db/prisma/schema.prisma
```

If `LATE` is NOT a value in the enum, completely remove the `lateRows` lookup and the for-loop that pushes `LATE_ARRIVAL_TODAY` alerts. Also remove `"LATE_ARRIVAL_TODAY"` from the `HubAlert.kind` union in `hub.types.ts`. Do not add a TODO comment — just delete the dead code path.

- [ ] **Step 3: Create the controller**

```typescript
// apps/api/src/modules/hr/hub/hub.controller.ts
import { Controller, Get, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { Roles } from "../../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../../common/guards/roles.guard";
import { HubService } from "./hub.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("hr")
export class HubController {
  constructor(private readonly service: HubService) {}

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER, RoleCode.FINANCE_MANAGER)
  @Get("hub")
  hub() {
    return this.service.getHub();
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER, RoleCode.FINANCE_MANAGER, RoleCode.PROJECT_MANAGER, RoleCode.EMPLOYEE)
  @Get("org-chart")
  orgChart() {
    return this.service.getOrgChart();
  }
}
```

- [ ] **Step 4: Wire `HubService` and `HubController` into `HrModule`**

Update `apps/api/src/modules/hr/hr.module.ts`. Add `HubController` to controllers, `HubService` to providers (no need to export — only used here).

- [ ] **Step 5: Build + smoke**

```bash
cd /Users/nifal/Documents/nuro/apps/api && npx tsc --noEmit
```

```bash
# Boot API, login as HR, hit both routes:
TOKEN=...   # (get HR token as in Plan 2A smoke tests)

curl -s http://localhost:4000/api/v1/hr/hub -H "authorization: Bearer $TOKEN" | python3 -m json.tool | head -40
curl -s http://localhost:4000/api/v1/hr/org-chart -H "authorization: Bearer $TOKEN" | python3 -m json.tool | head -20
```

Expected: both return 200 with the documented shapes. If alerts are empty (no late-status today, no probation-ending), that's fine. The org-chart's `roots` array should have at least one node (every employee whose `managerId` is null is a root).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/hr/hub apps/api/src/modules/hr/hr.module.ts
git commit -m "feat(hr): add /hr/hub aggregator and /hr/org-chart endpoints"
```

---

## Task 2: API — `POST /hr/employees/:userId/terminate`

**Files:**
- Modify: `apps/api/src/modules/hr/employee-profile/employee-profile.service.ts`
- Modify: `apps/api/src/modules/hr/employee-profile/employee-profile.controller.ts`
- Create: `apps/api/src/modules/hr/employee-profile/dto/terminate-employee.dto.ts`

- [ ] **Step 1: Create `TerminateEmployeeDto`**

```typescript
// apps/api/src/modules/hr/employee-profile/dto/terminate-employee.dto.ts
import { IsDateString, IsOptional, IsString } from "class-validator";

export class TerminateEmployeeDto {
  @IsDateString()
  effectiveDate!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
```

- [ ] **Step 2: Add `terminate` method to `EmployeeProfileService`**

```typescript
  async terminate(viewerCtx: ViewerContext, rawUserId: string, dto: import("./dto/terminate-employee.dto").TerminateEmployeeDto) {
    const target = await this.resolveTarget(rawUserId, viewerCtx.id);
    await this.requireAction(viewerCtx, target.userId, "TERMINATE");

    const effectiveDate = new Date(dto.effectiveDate);

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Mark profile terminated
      await tx.employeeProfile.update({
        where: { id: target.employeeId },
        data: { terminatedAt: effectiveDate },
      });

      // 2. Deactivate the user account
      await tx.user.update({
        where: { id: target.userId },
        data: { status: "INACTIVE" },
      });

      // 3. Release any assigned assets
      const released = await tx.asset.updateMany({
        where: { assignedToId: target.userId },
        data: { assignedToId: null, assignedAt: null, status: "AVAILABLE" },
      });

      // 4. Log the status event
      await tx.employmentStatusEvent.create({
        data: {
          employeeId: target.employeeId,
          type: "TERMINATED",
          effectiveDate,
          reason: dto.reason,
          createdById: viewerCtx.id,
        },
      });

      return { releasedAssetCount: released.count };
    });

    return { success: true, ...result };
  }
```

The `User.status = "INACTIVE"` value must exist in the `UserStatus` enum. Verify:

```bash
grep -n "enum UserStatus" -A 10 /Users/nifal/Documents/nuro/packages/db/prisma/schema.prisma
```

If the value is named `DISABLED` or `TERMINATED` instead of `INACTIVE`, adjust. The seed file calls `UserStatus.ACTIVE` and `UserStatus.INVITED` — check what disable-like value exists.

The `Asset.status = "AVAILABLE"` value must exist in `AssetStatus`. Same drill — the schema defines `enum AssetStatus`; use whatever its "free" value is.

- [ ] **Step 3: Add controller route**

```typescript
  @Post(":userId/terminate")
  terminate(
    @Param("userId") userId: string,
    @Body() dto: TerminateEmployeeDto,
    @CurrentUser() user: { id: string; roles: RoleCode[] },
  ) {
    return this.service.terminate(viewerFromRequest(user), userId, dto);
  }
```

Add `TerminateEmployeeDto` to the controller's imports.

- [ ] **Step 4: Verify**

```bash
cd /Users/nifal/Documents/nuro/apps/api && npx tsc --noEmit
```

```bash
# Smoke: terminate the engineer (HR action). Capture engineer's userId first.
ENG_USER_ID=$(curl -s -X POST http://localhost:4000/api/v1/auth/login -H "content-type: application/json" -d '{"email":"engineer@nuro7.com","password":"ChangeMe123!"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['id'])")

curl -s -X POST http://localhost:4000/api/v1/hr/employees/$ENG_USER_ID/terminate \
  -H "authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d "{\"effectiveDate\":\"2026-05-05\",\"reason\":\"Smoke test\"}" | python3 -m json.tool
```

Expected: `{"success": true, "releasedAssetCount": <n>}`. Verify in DB that `terminatedAt` is set and the user's status flipped:

```bash
PGPASSWORD=postgres psql -h localhost -U postgres -d nuro7 -c "SELECT u.status, ep.\"terminatedAt\" FROM \"User\" u JOIN \"EmployeeProfile\" ep ON ep.\"userId\"=u.id WHERE u.email='engineer@nuro7.com';"
```

**Then immediately re-seed to undo (so other tests still work):** `npm run db:seed`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/hr/employee-profile
git commit -m "feat(hr): POST /hr/employees/:userId/terminate (transactional with asset release)"
```

---

## Task 3: API — `GET /hr/employees` directory (paginated, filtered)

**Files:**
- Modify: `apps/api/src/modules/hr/employee-profile/employee-profile.service.ts`
- Modify: `apps/api/src/modules/hr/employee-profile/employee-profile.controller.ts`

- [ ] **Step 1: Add `listDirectory` method**

```typescript
  async listDirectory(filters: {
    search?: string;
    department?: string;
    employmentType?: string;
    active?: "true" | "false" | undefined;
    managerId?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, filters.pageSize ?? 20);
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};
    if (filters.department) where.department = filters.department;
    if (filters.employmentType) where.employmentType = filters.employmentType;
    if (filters.managerId) where.managerId = filters.managerId;
    if (filters.active === "true") where.terminatedAt = null;
    else if (filters.active === "false") where.NOT = [{ terminatedAt: null }];

    const userWhere: Record<string, unknown> = {};
    if (filters.search) {
      userWhere.OR = [
        { firstName: { contains: filters.search, mode: "insensitive" } },
        { lastName: { contains: filters.search, mode: "insensitive" } },
        { email: { contains: filters.search, mode: "insensitive" } },
      ];
    }
    if (Object.keys(userWhere).length > 0) where.user = userWhere;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.employeeProfile.findMany({
        where: where as never,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true, status: true } },
          manager: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: [{ user: { firstName: "asc" } }, { user: { lastName: "asc" } }],
        skip,
        take: pageSize,
      }),
      this.prisma.employeeProfile.count({ where: where as never }),
    ]);

    return {
      data: data.map((p) => ({
        userId: p.userId,
        firstName: p.user.firstName,
        lastName: p.user.lastName,
        email: p.user.email,
        avatarUrl: p.user.avatarUrl,
        status: p.user.status,
        department: p.department,
        designation: p.designation,
        employmentType: p.employmentType,
        joinDate: p.joinDate.toISOString(),
        terminated: !!p.terminatedAt,
        managerLabel: p.manager ? `${p.manager.firstName} ${p.manager.lastName}` : null,
      })),
      meta: {
        page, pageSize, total,
        pageCount: Math.ceil(total / pageSize),
      },
    };
  }
```

- [ ] **Step 2: Add controller route**

```typescript
  @Get()
  listDirectory(
    @Query("search") search?: string,
    @Query("department") department?: string,
    @Query("employmentType") employmentType?: string,
    @Query("managerId") managerId?: string,
    @Query("active") active?: "true" | "false",
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.service.listDirectory({
      search, department, employmentType, managerId, active,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }
```

Add `Query` to the controller's imports from `@nestjs/common`.

NOTE: This route MUST come BEFORE the existing `@Get(":userId")` route in the controller's source (NestJS matches in order; otherwise `/hr/employees?` would be interpreted as `/hr/employees/:userId`). Place this method definition BEFORE `getOverview`.

- [ ] **Step 3: Verify**

```bash
cd /Users/nifal/Documents/nuro/apps/api && npx tsc --noEmit
```

```bash
curl -s "http://localhost:4000/api/v1/hr/employees?pageSize=3&active=true" \
  -H "authorization: Bearer $TOKEN" | python3 -m json.tool | head -30
```

Expected: paginated `{data: [...], meta: {...}}`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/hr/employee-profile
git commit -m "feat(hr): GET /hr/employees directory with filters and pagination"
```

---

## Task 4: Web — typed hooks for hub, directory, org-chart, terminate

**File:** `apps/web/lib/api/hr-hub.ts` (new)

- [ ] **Step 1: Create the hooks file**

```typescript
// apps/web/lib/api/hr-hub.ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiPost } from "./client";
import { toast } from "@/lib/hooks/use-toast";   // match existing path

export interface HubKpis {
  headcount: number;
  newHiresThisMonth: number;
  attritionThisQuarter: number;
  averageTenureYears: number;
  openPositions: number;
  payrollCostMtd: number;
}

export interface HubAlert {
  id: string;
  kind: string;
  userId: string;
  userName: string;
  detail: string;
  severity: "info" | "warning" | "destructive";
}

export interface HubAnniversary {
  userId: string; userName: string; joinDate: string; yearsAt: number; daysAway: number;
}

export interface HubOnboardingItem {
  userId: string; userName: string; checklistTitle: string;
  doneCount: number; totalCount: number; startedAt: string;
}

export interface HubReviewItem {
  reviewId: string; userId: string; userName: string; reviewType: string;
  scheduledFor: string | null; overdue: boolean;
}

export interface HubPendingApproval {
  kind: "LEAVE"; id: string; userId: string; userName: string;
  summary: string; createdAt: string;
}

export interface HubChartData {
  departmentBreakdown: Array<{ label: string; value: number }>;
  headcountTrend: Array<{ label: string; value: number }>;
  leaveRequestsTrend: Array<{ label: string; value: number }>;
  attendanceRateThisMonth: number;
}

export interface HubResponse {
  kpis: HubKpis;
  alerts: HubAlert[];
  anniversaries: HubAnniversary[];
  onboarding: HubOnboardingItem[];
  upcomingReviews: HubReviewItem[];
  pendingApprovals: HubPendingApproval[];
  charts: HubChartData;
  directorySnapshot: {
    total: number;
    recentHires: Array<{ userId: string; userName: string; designation: string; department: string; joinDate: string }>;
  };
}

export interface OrgNode {
  userId: string;
  name: string;
  designation: string;
  department: string;
  avatarUrl: string | null;
  reports: OrgNode[];
}

export interface DirectoryEntry {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
  status: string;
  department: string;
  designation: string;
  employmentType: string;
  joinDate: string;
  terminated: boolean;
  managerLabel: string | null;
}

export function useHrHub() {
  return useQuery({
    queryKey: ["hr-hub"],
    queryFn: () => apiFetch<HubResponse>("/hr/hub"),
  });
}

export function useOrgChart() {
  return useQuery({
    queryKey: ["hr-org-chart"],
    queryFn: () => apiFetch<{ roots: OrgNode[] }>("/hr/org-chart"),
  });
}

export interface DirectoryFilters {
  search?: string;
  department?: string;
  employmentType?: string;
  managerId?: string;
  active?: "true" | "false";
  page?: number;
  pageSize?: number;
}

export function useEmployeeDirectory(filters: DirectoryFilters) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v != null && v !== "") qs.set(k, String(v));
  }
  const url = `/hr/employees${qs.toString() ? `?${qs.toString()}` : ""}`;
  return useQuery({
    queryKey: ["hr-directory", JSON.stringify(filters)],
    queryFn: () => apiFetch<{ data: DirectoryEntry[]; meta: { page: number; pageSize: number; total: number; pageCount: number } }>(url),
  });
}

export function useTerminateEmployee(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { effectiveDate: string; reason?: string }) =>
      apiPost<{ success: boolean; releasedAssetCount: number }>(`/hr/employees/${userId}/terminate`, data),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["hr-hub"] });
      void qc.invalidateQueries({ queryKey: ["hr-directory"] });
      void qc.invalidateQueries({ queryKey: ["employee-profile", userId] });
      toast({
        variant: "success",
        title: "Employee terminated",
        description: `${data.releasedAssetCount} asset(s) released.`,
      });
    },
    onError: (err: Error) =>
      toast({ variant: "error", title: "Failed to terminate", description: err?.message }),
  });
}
```

If the toast hook lives at a different path, match the existing imports in `apps/web/lib/api/mutations.ts`.

- [ ] **Step 2: Verify + commit**

```bash
cd /Users/nifal/Documents/nuro/apps/web && npx tsc --noEmit
git add apps/web/lib/api/hr-hub.ts
git commit -m "feat(hr): typed hooks for hub, org-chart, directory, terminate"
```

---

## Task 5: Web — TerminateEmployeeDialog

**File:** `apps/web/components/hr/employee/terminate-employee-dialog.tsx`

- [ ] **Step 1: Create the dialog**

```typescript
"use client";

import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useTerminateEmployee } from "@/lib/api/hr-hub";

interface Props {
  userId: string;
  employeeName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess?: () => void;
}

export function TerminateEmployeeDialog({ userId, employeeName, open, onOpenChange, onSuccess }: Props) {
  const m = useTerminateEmployee(userId);
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");

  const submit = () => {
    if (confirm.trim() !== employeeName) return;
    m.mutate(
      { effectiveDate, reason: reason || undefined },
      { onSuccess: () => { onOpenChange(false); onSuccess?.(); } },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Terminate employee</DialogTitle>
          <DialogDescription>
            This will deactivate <span className="font-medium">{employeeName}</span>'s account and release their assigned assets. This is reversible only by manual edit.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Effective date</label>
            <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Reason (optional)</label>
            <TextArea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Type <span className="font-mono">{employeeName}</span> to confirm
            </label>
            <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={m.isPending || confirm.trim() !== employeeName}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {m.isPending ? "Terminating..." : "Terminate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Wire into `EmployeeHeader`**

In `apps/web/components/hr/employee/employee-header.tsx`, add a "Terminate" button next to the "Resend invite" button (HR-only, not shown if already terminated):

```typescript
import { useState } from "react";
import { TerminateEmployeeDialog } from "./terminate-employee-dialog";

// inside component:
const [termOpen, setTermOpen] = useState(false);

// in the action area (near Resend invite):
{isHr && !employee.terminated && (
  <Button
    size="sm"
    variant="ghost"
    className="text-red-600 hover:bg-red-50 hover:text-red-700"
    onClick={() => setTermOpen(true)}
  >
    Terminate
  </Button>
)}

// at the bottom:
<TerminateEmployeeDialog
  userId={employee.userId}
  employeeName={`${employee.firstName} ${employee.lastName}`}
  open={termOpen}
  onOpenChange={setTermOpen}
/>
```

- [ ] **Step 3: Verify + commit**

```bash
cd /Users/nifal/Documents/nuro/apps/web && npx tsc --noEmit
git add apps/web/components/hr
git commit -m "feat(hr): TerminateEmployeeDialog with name confirmation + header wire-up"
```

---

## Task 6: Web — HR Hub page rebuild + 9 widgets

This is the biggest UI task. Rebuild `/hr` from scratch using the hub aggregator.

**Files (all new):**
- `apps/web/components/hr/hub/quick-actions-bar.tsx`
- `apps/web/components/hr/hub/kpi-strip.tsx`
- `apps/web/components/hr/hub/approvals-queue.tsx`
- `apps/web/components/hr/hub/alerts-panel.tsx`
- `apps/web/components/hr/hub/celebrations.tsx`
- `apps/web/components/hr/hub/onboarding-queue.tsx`
- `apps/web/components/hr/hub/upcoming-reviews.tsx`
- `apps/web/components/hr/hub/directory-snapshot.tsx`
- `apps/web/components/hr/hub/org-chart-preview.tsx`

**File (rebuild):**
- `apps/web/app/(dashboard)/hr/page.tsx`

The widgets are all simple: each accepts a slice of `HubResponse` as a prop and renders it. Follow the existing UI primitives (`Card`, `Badge`, `Button`).

- [ ] **Step 1: Build all 9 widget components**

Each widget is a small function component. Keep each file under 80 lines. Quick-actions-bar:

```typescript
// apps/web/components/hr/hub/quick-actions-bar.tsx
"use client";

import { Button } from "@/components/ui/button";

export function QuickActionsBar({
  onAddEmployee,
}: { onAddEmployee: () => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={onAddEmployee}>+ Add employee</Button>
      <Button variant="secondary" disabled title="Phase 4 follow-up">Run payroll</Button>
      <Button variant="secondary" disabled title="Use approvals queue below">Approve leaves</Button>
      <Button variant="secondary" disabled title="Phase 4 follow-up">Schedule review</Button>
    </div>
  );
}
```

KPI strip:

```typescript
// apps/web/components/hr/hub/kpi-strip.tsx
"use client";

import { Card } from "@/components/ui/card";
import type { HubKpis } from "@/lib/api/hr-hub";
import { formatCurrency } from "@/lib/utils";

export function KpiStrip({ kpis }: { kpis: HubKpis }) {
  const items = [
    { label: "Headcount", value: kpis.headcount.toString() },
    { label: "New hires (MTD)", value: kpis.newHiresThisMonth.toString() },
    { label: "Attrition (Q)", value: `${kpis.attritionThisQuarter.toFixed(1)}%` },
    { label: "Avg tenure", value: `${kpis.averageTenureYears.toFixed(1)} yr` },
    { label: "Open positions", value: kpis.openPositions.toString() },
    { label: "Payroll MTD", value: formatCurrency(kpis.payrollCostMtd) },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {items.map((it) => (
        <Card key={it.label} className="p-3">
          <div className="text-xs uppercase tracking-wider text-slate-400">{it.label}</div>
          <div className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{it.value}</div>
        </Card>
      ))}
    </div>
  );
}
```

Approvals queue (with inline approve/reject — calls the existing leave-status mutation that's already in `mutations.ts`):

```typescript
// apps/web/components/hr/hub/approvals-queue.tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { HubPendingApproval } from "@/lib/api/hr-hub";
import { useUpdateLeaveStatus } from "@/lib/api/mutations";

export function ApprovalsQueue({ items }: { items: HubPendingApproval[] }) {
  const m = useUpdateLeaveStatus();
  return (
    <Card className="p-5">
      <h3 className="mb-3 font-semibold">Pending approvals ({items.length})</h3>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">Nothing waiting on you.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((it) => (
            <li key={`${it.kind}-${it.id}`} className="flex items-center justify-between rounded border border-slate-100 p-3 dark:border-slate-800">
              <div>
                <div className="text-sm font-medium">{it.userName}</div>
                <div className="text-xs text-slate-500">{it.summary}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone="warning" size="sm">{it.kind}</Badge>
                <Button size="sm" variant="secondary" onClick={() => m.mutate({ id: it.id, status: "APPROVED" })} disabled={m.isPending}>Approve</Button>
                <Button size="sm" variant="ghost" onClick={() => m.mutate({ id: it.id, status: "REJECTED" })} disabled={m.isPending}>Reject</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
```

If `useUpdateLeaveStatus` doesn't exist in `mutations.ts`, find whatever the leave-approval mutation hook is called and use that. (Plan 1's existing `/hr` page uses `useAllLeaveRequests` to fetch and a mutation to approve — search the file.)

Alerts panel:

```typescript
// apps/web/components/hr/hub/alerts-panel.tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { HubAlert } from "@/lib/api/hr-hub";

const TONE: Record<HubAlert["severity"], "info" | "warning" | "destructive"> = {
  info: "info", warning: "warning", destructive: "destructive",
};

export function AlertsPanel({ alerts }: { alerts: HubAlert[] }) {
  return (
    <Card className="p-5">
      <h3 className="mb-3 font-semibold">Alerts ({alerts.length})</h3>
      {alerts.length === 0 ? (
        <p className="text-sm text-slate-500">No active alerts.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {alerts.map((a) => (
            <li key={a.id} className="flex items-center justify-between rounded border border-slate-100 p-3 dark:border-slate-800">
              <div>
                <div className="text-sm font-medium">{a.userName}</div>
                <div className="text-xs text-slate-500">{a.detail}</div>
              </div>
              <Badge tone={TONE[a.severity]} size="sm">{a.kind.replace(/_/g, " ").toLowerCase()}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
```

Celebrations:

```typescript
// apps/web/components/hr/hub/celebrations.tsx
"use client";

import { Card } from "@/components/ui/card";
import type { HubAnniversary } from "@/lib/api/hr-hub";

export function Celebrations({ anniversaries }: { anniversaries: HubAnniversary[] }) {
  return (
    <Card className="p-5">
      <h3 className="mb-3 font-semibold">Anniversaries ({anniversaries.length})</h3>
      {anniversaries.length === 0 ? (
        <p className="text-sm text-slate-500">No milestone anniversaries this week.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {anniversaries.map((a) => (
            <li key={a.userId} className="flex items-center justify-between rounded border border-slate-100 p-3 dark:border-slate-800">
              <div>
                <div className="text-sm font-medium">{a.userName}</div>
                <div className="text-xs text-slate-500">
                  {a.yearsAt} year{a.yearsAt === 1 ? "" : "s"} on {new Date(a.joinDate).toLocaleDateString()}
                </div>
              </div>
              <span className="text-xs text-slate-400">
                {a.daysAway === 0 ? "today" : a.daysAway === 1 ? "tomorrow" : `${a.daysAway} days`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
```

Onboarding queue:

```typescript
// apps/web/components/hr/hub/onboarding-queue.tsx
"use client";

import { Card } from "@/components/ui/card";
import type { HubOnboardingItem } from "@/lib/api/hr-hub";

export function OnboardingQueue({ items }: { items: HubOnboardingItem[] }) {
  return (
    <Card className="p-5">
      <h3 className="mb-3 font-semibold">Active onboarding ({items.length})</h3>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">No active onboarding.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((it) => (
            <li key={`${it.userId}-${it.checklistTitle}`} className="rounded border border-slate-100 p-3 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">{it.userName}</div>
                <span className="text-xs text-slate-500">{it.doneCount}/{it.totalCount}</span>
              </div>
              <div className="mt-1 text-xs text-slate-500">{it.checklistTitle}</div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
```

Upcoming reviews:

```typescript
// apps/web/components/hr/hub/upcoming-reviews.tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { HubReviewItem } from "@/lib/api/hr-hub";

export function UpcomingReviews({ reviews }: { reviews: HubReviewItem[] }) {
  return (
    <Card className="p-5">
      <h3 className="mb-3 font-semibold">Recent reviews ({reviews.length})</h3>
      {reviews.length === 0 ? (
        <p className="text-sm text-slate-500">No recent reviews.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {reviews.map((r) => (
            <li key={r.reviewId} className="flex items-center justify-between rounded border border-slate-100 p-3 dark:border-slate-800">
              <div>
                <div className="text-sm font-medium">{r.userName}</div>
                <div className="text-xs text-slate-500">{r.reviewType}</div>
              </div>
              {r.overdue && <Badge tone="destructive" size="sm">Overdue</Badge>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
```

Directory snapshot:

```typescript
// apps/web/components/hr/hub/directory-snapshot.tsx
"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import type { HubResponse } from "@/lib/api/hr-hub";

export function DirectorySnapshot({ snapshot }: { snapshot: HubResponse["directorySnapshot"] }) {
  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold">Recent hires</h3>
        <Link href="/hr/employees" className="text-xs text-blue-600 hover:underline">View all {snapshot.total} →</Link>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {snapshot.recentHires.map((h) => (
          <li key={h.userId} className="rounded border border-slate-100 p-3 dark:border-slate-800">
            <Link href={`/hr/employees/${h.userId}`} className="block">
              <div className="text-sm font-medium">{h.userName}</div>
              <div className="text-xs text-slate-500">
                {h.designation} · {h.department} · joined {new Date(h.joinDate).toLocaleDateString()}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
```

Org chart preview (compact tree, root only):

```typescript
// apps/web/components/hr/hub/org-chart-preview.tsx
"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { useOrgChart } from "@/lib/api/hr-hub";

export function OrgChartPreview() {
  const q = useOrgChart();
  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold">Org chart</h3>
        <Link href="/hr/org-chart" className="text-xs text-blue-600 hover:underline">View full →</Link>
      </div>
      {q.isLoading || !q.data ? (
        <p className="mt-3 text-sm text-slate-500">Loading...</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1">
          {q.data.roots.slice(0, 4).map((root) => (
            <li key={root.userId} className="text-sm">
              <Link href={`/hr/employees/${root.userId}`} className="font-medium hover:underline">{root.name}</Link>
              <span className="ml-2 text-xs text-slate-500">{root.designation} ({root.reports.length} reports)</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Rebuild `apps/web/app/(dashboard)/hr/page.tsx`**

```typescript
"use client";

import { useState } from "react";
import { ModuleHeader } from "@/components/layout/module-header";
import { ChartCard, DonutChart, TrendChart, CHART_COLORS } from "@/components/charts";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { AddEmployeeDialog } from "@/components/hr/add-employee-dialog";
import { QuickActionsBar } from "@/components/hr/hub/quick-actions-bar";
import { KpiStrip } from "@/components/hr/hub/kpi-strip";
import { ApprovalsQueue } from "@/components/hr/hub/approvals-queue";
import { AlertsPanel } from "@/components/hr/hub/alerts-panel";
import { Celebrations } from "@/components/hr/hub/celebrations";
import { OnboardingQueue } from "@/components/hr/hub/onboarding-queue";
import { UpcomingReviews } from "@/components/hr/hub/upcoming-reviews";
import { DirectorySnapshot } from "@/components/hr/hub/directory-snapshot";
import { OrgChartPreview } from "@/components/hr/hub/org-chart-preview";
import { useHrHub } from "@/lib/api/hr-hub";

export default function HrPage() {
  const q = useHrHub();
  const [addOpen, setAddOpen] = useState(false);

  if (q.isLoading) return <LoadingState label="Loading HR hub..." />;
  if (q.isError || !q.data) return <ErrorState label="Unable to load HR hub." />;

  const h = q.data;

  return (
    <div className="flex flex-col gap-6">
      <ModuleHeader
        module="hr"
        title="People Operations"
        description="Operational hub for HR — approvals, alerts, headcount, and quick actions."
        counts={[
          { label: "headcount", value: h.kpis.headcount },
          { label: "pending leaves", value: h.pendingApprovals.length },
        ]}
      />

      <QuickActionsBar onAddEmployee={() => setAddOpen(true)} />
      <KpiStrip kpis={h.kpis} />

      <section className="grid gap-4 md:grid-cols-2">
        <ApprovalsQueue items={h.pendingApprovals} />
        <AlertsPanel alerts={h.alerts} />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Celebrations anniversaries={h.anniversaries} />
        <OnboardingQueue items={h.onboarding} />
      </section>

      <UpcomingReviews reviews={h.upcomingReviews} />

      <section className="grid gap-4 md:grid-cols-2">
        <ChartCard title="Employees by Department">
          <DonutChart data={h.charts.departmentBreakdown} total={h.kpis.headcount.toString()} totalLabel="people" height={240} />
        </ChartCard>
        <ChartCard title="Headcount Growth" description="Cumulative joins, last 12 months">
          <TrendChart data={h.charts.headcountTrend} color={CHART_COLORS.emerald} type="area" height={240} />
        </ChartCard>
        <ChartCard title="Leave Requests Over Time" description="Last 12 months">
          <TrendChart data={h.charts.leaveRequestsTrend} color={CHART_COLORS.amber} type="area" height={240} />
        </ChartCard>
        <div className="flex items-center justify-center rounded-lg border border-slate-200 p-6 dark:border-slate-800">
          <div className="text-center">
            <div className="text-xs uppercase text-slate-400">Attendance Rate (Month)</div>
            <div className="mt-1 text-3xl font-semibold">{h.charts.attendanceRateThisMonth}%</div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <DirectorySnapshot snapshot={h.directorySnapshot} />
        <OrgChartPreview />
      </section>

      <AddEmployeeDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
```

- [ ] **Step 3: Verify + commit**

```bash
cd /Users/nifal/Documents/nuro/apps/web && npx tsc --noEmit
git add apps/web/components/hr/hub apps/web/app/\(dashboard\)/hr/page.tsx
git commit -m "feat(hr): rebuild /hr as the operations hub with 9 widgets"
```

If `useUpdateLeaveStatus` doesn't exist in `mutations.ts`, the `ApprovalsQueue` import will fail. Either:
- find the existing leave-approval mutation and use it, OR
- add `useUpdateLeaveStatus` to `mutations.ts` (a 15-line wrapper around `apiPatch("/leave/:id/status", { status })`).

---

## Task 7: Web — Org chart page (recursive tree)

**Files:**
- Create: `apps/web/components/hr/org-chart/org-node.tsx`
- Create: `apps/web/components/hr/org-chart/org-tree.tsx`
- Create: `apps/web/app/(dashboard)/hr/org-chart/page.tsx`

- [ ] **Step 1: `OrgNode` component (recursive)**

```typescript
// apps/web/components/hr/org-chart/org-node.tsx
"use client";

import Link from "next/link";
import type { OrgNode as OrgNodeType } from "@/lib/api/hr-hub";

export function OrgNode({ node, depth = 0 }: { node: OrgNodeType; depth?: number }) {
  return (
    <li className="my-1">
      <div className="flex items-center gap-2">
        <Link href={`/hr/employees/${node.userId}`} className="rounded border border-slate-200 px-3 py-1.5 text-sm hover:border-blue-400 hover:bg-blue-50 dark:border-slate-700 dark:hover:bg-slate-800">
          <span className="font-medium">{node.name}</span>
          <span className="ml-2 text-xs text-slate-500">{node.designation}</span>
        </Link>
        {node.reports.length > 0 && <span className="text-xs text-slate-400">({node.reports.length})</span>}
      </div>
      {node.reports.length > 0 && (
        <ul className="ml-6 border-l border-slate-200 pl-4 dark:border-slate-700">
          {node.reports.map((child) => (
            <OrgNode key={child.userId} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}
```

- [ ] **Step 2: `OrgTree` wrapper**

```typescript
// apps/web/components/hr/org-chart/org-tree.tsx
"use client";

import { Card } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useOrgChart } from "@/lib/api/hr-hub";
import { OrgNode } from "./org-node";

export function OrgTree() {
  const q = useOrgChart();
  if (q.isLoading) return <LoadingState label="Loading org chart..." />;
  if (q.isError || !q.data) return <ErrorState label="Unable to load org chart." />;
  if (q.data.roots.length === 0) return <Card className="p-5 text-sm text-slate-500">No employees yet.</Card>;

  return (
    <Card className="p-5">
      <ul>
        {q.data.roots.map((root) => (
          <OrgNode key={root.userId} node={root} />
        ))}
      </ul>
    </Card>
  );
}
```

- [ ] **Step 3: `/hr/org-chart` page**

```typescript
// apps/web/app/(dashboard)/hr/org-chart/page.tsx
"use client";

import { ModuleHeader } from "@/components/layout/module-header";
import { OrgTree } from "@/components/hr/org-chart/org-tree";

export default function OrgChartPage() {
  return (
    <div className="flex flex-col gap-6">
      <ModuleHeader
        module="hr"
        title="Org chart"
        description="Reporting structure across the company."
      />
      <OrgTree />
    </div>
  );
}
```

- [ ] **Step 4: Verify + commit**

```bash
cd /Users/nifal/Documents/nuro/apps/web && npx tsc --noEmit
git add apps/web/components/hr/org-chart apps/web/app/\(dashboard\)/hr/org-chart
git commit -m "feat(hr): /hr/org-chart page with recursive tree"
```

---

## Task 8: Web — Directory page with filters

**File:** `apps/web/app/(dashboard)/hr/employees/page.tsx`

- [ ] **Step 1: Create the page**

```typescript
// apps/web/app/(dashboard)/hr/employees/page.tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { ModuleHeader } from "@/components/layout/module-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { AddEmployeeDialog } from "@/components/hr/add-employee-dialog";
import { useEmployeeDirectory } from "@/lib/api/hr-hub";

const EMPLOYMENT_TYPES = [
  { value: "", label: "All types" },
  { value: "FULL_TIME", label: "Full time" },
  { value: "PART_TIME", label: "Part time" },
  { value: "CONTRACT", label: "Contract" },
  { value: "INTERN", label: "Intern" },
];

const ACTIVE_OPTIONS = [
  { value: "true", label: "Active only" },
  { value: "false", label: "Terminated only" },
  { value: "", label: "Both" },
];

export default function DirectoryPage() {
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [active, setActive] = useState<"true" | "false" | "">("true");
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);

  const q = useEmployeeDirectory({
    search: search || undefined,
    department: department || undefined,
    employmentType: employmentType || undefined,
    active: (active === "true" || active === "false") ? active : undefined,
    page,
    pageSize: 20,
  });

  return (
    <div className="flex flex-col gap-6">
      <ModuleHeader
        module="hr"
        title="Employee directory"
        description="All employees with filters."
        counts={q.data ? [{ label: "total", value: q.data.meta.total }] : undefined}
      />
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-500">Search</label>
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="name or email" />
        </div>
        <div className="w-44">
          <label className="mb-1 block text-xs font-medium text-slate-500">Department</label>
          <Input value={department} onChange={(e) => { setDepartment(e.target.value); setPage(1); }} placeholder="any" />
        </div>
        <div className="w-44">
          <label className="mb-1 block text-xs font-medium text-slate-500">Employment</label>
          <Select value={employmentType} onValueChange={(v) => { setEmploymentType(v); setPage(1); }} options={EMPLOYMENT_TYPES} />
        </div>
        <div className="w-44">
          <label className="mb-1 block text-xs font-medium text-slate-500">Status</label>
          <Select value={active} onValueChange={(v) => { setActive(v as "true" | "false" | ""); setPage(1); }} options={ACTIVE_OPTIONS} />
        </div>
        <Button onClick={() => setAddOpen(true)} className="ml-auto">+ Add employee</Button>
      </div>

      {q.isLoading && <LoadingState label="Loading..." />}
      {q.isError && <ErrorState label="Unable to load directory." />}

      {q.data && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {q.data.data.map((e) => (
              <Link key={e.userId} href={`/hr/employees/${e.userId}`} className="block">
                <Card className="hover:border-blue-400">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {e.firstName} {e.lastName}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{e.email}</div>
                    </div>
                    {e.terminated && <Badge tone="destructive" size="sm">Terminated</Badge>}
                    {e.status === "INVITED" && <Badge tone="warning" size="sm">Invited</Badge>}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge tone="hr" size="sm" dot>{e.department}</Badge>
                    <Badge tone="neutral" size="sm">{e.designation}</Badge>
                    {e.employmentType && <Badge tone="info" size="sm">{e.employmentType}</Badge>}
                  </div>
                  {e.managerLabel && (
                    <div className="mt-2 text-xs text-slate-500">Manager: {e.managerLabel}</div>
                  )}
                </Card>
              </Link>
            ))}
          </div>

          {q.data.meta.pageCount > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Page {q.data.meta.page} / {q.data.meta.pageCount}</span>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}>Prev</Button>
                <Button variant="secondary" size="sm" onClick={() => setPage(Math.min(q.data!.meta.pageCount, page + 1))} disabled={page >= q.data!.meta.pageCount}>Next</Button>
              </div>
            </div>
          )}
        </>
      )}

      <AddEmployeeDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
```

If `Badge tone="hr"` isn't a valid tone, replace with `tone="info"`.

- [ ] **Step 2: Verify + commit**

```bash
cd /Users/nifal/Documents/nuro/apps/web && npx tsc --noEmit
git add apps/web/app/\(dashboard\)/hr/employees/page.tsx
git commit -m "feat(hr): /hr/employees directory page with filters and pagination"
```

---

## Task 9: End-to-end smoke test

- [ ] **Step 1: Boot API + web**

```bash
cd /Users/nifal/Documents/nuro
npm run dev:api &  # background
sleep 12
npm run dev:web &  # background
sleep 8
```

- [ ] **Step 2: Hit each new endpoint via curl**

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/v1/auth/login -H "content-type: application/json" -d '{"email":"hr@nuro7.com","password":"ChangeMe123!"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

curl -s -o /dev/null -w "%{http_code}  /hr/hub\n" http://localhost:4000/api/v1/hr/hub -H "authorization: Bearer $TOKEN"
curl -s -o /dev/null -w "%{http_code}  /hr/org-chart\n" http://localhost:4000/api/v1/hr/org-chart -H "authorization: Bearer $TOKEN"
curl -s -o /dev/null -w "%{http_code}  /hr/employees?pageSize=3\n" "http://localhost:4000/api/v1/hr/employees?pageSize=3" -H "authorization: Bearer $TOKEN"
```

Expected: all `200`.

- [ ] **Step 3: Hit each new web page**

```bash
for path in /hr /hr/employees /hr/org-chart; do
  curl -s -o /dev/null -w "%{http_code}  $path\n" "http://localhost:3000$path"
done
```

Expected: all `200`. Then look at the dev:web log for compile errors:

```bash
grep -E "Error|error|✗" /private/tmp/claude-501/-Users-nifal-Documents-nuro/*/tasks/*.output 2>&1 | tail -20
```

(Adjust the glob to whatever your background task output path is.)

- [ ] **Step 4: Stop servers**

```bash
pkill -f "next dev" 2>&1
pkill -f "nest start" 2>&1
```

No commit for the smoke test.

---

## What's done at the end of this plan

✅ `/hr/hub` aggregator returning every operational widget's data in one call.
✅ `/hr/org-chart` recursive tree.
✅ `POST /hr/employees/:userId/terminate` with transactional asset release + status event.
✅ `GET /hr/employees` paginated, filtered directory.
✅ `/hr` rebuild as the operations hub: KPIs, quick actions, approvals queue with inline approve/reject, alerts, anniversaries, onboarding queue, recent reviews, charts, directory snapshot, org-chart preview.
✅ `/hr/employees` directory page.
✅ `/hr/org-chart` standalone page.
✅ `<TerminateEmployeeDialog>` wired into `EmployeeHeader`.

## What's NOT in this plan

- **Birthdays** in Celebrations — needs a `dateOfBirth` schema field, deferred.
- **Open positions** KPI is hardcoded `0` — no recruitment / positions model exists.
- **Document upload/delete** — Plan 2C.
- **Real "scheduled" reviews** — `PerformanceReview` has no scheduledFor; the widget shows recent reviews instead. A future schema enhancement could add it.
