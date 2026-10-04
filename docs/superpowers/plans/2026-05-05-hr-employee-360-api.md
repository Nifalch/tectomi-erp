# HR Employee 360° API Implementation Plan (Plan 2A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the entire backend for the Employee 360° detail page — one root endpoint plus 11 per-tab endpoints plus 4 write-action endpoints, all permission-aware via `HrPermissionsService`.

**Architecture:** Orchestrator + delegation. A new `EmployeeProfileController` mounts under `/hr/employees/:userId/...` and delegates to a new `EmployeeProfileService`. The service uses existing domain services (`AttendanceService`, `LeaveService`, etc.) for tab data where possible, queries Prisma directly otherwise, then applies field masking via `HrPermissionsService` before returning. Every endpoint accepts the literal `me` as `:userId` and resolves it to the authenticated user.

**Tech Stack:** NestJS 11, Prisma 6, class-validator/class-transformer, the `HrPermissionsService` shipped in Plan 1.

**Spec:** [docs/superpowers/specs/2026-05-04-hr-operations-system-design.md](../specs/2026-05-04-hr-operations-system-design.md)

**Verification model:** type-check + lint + curl smoke test for each endpoint. (No test framework installed.)

**Project working directory:** `/Users/nifal/Documents/nuro`

**Depends on:** Plan 1 (HR foundation — `HrPermissionsService`, schema additions, `EmploymentStatusEvent`, `HrNote`, `terminatedAt`).

---

## File map

**API (new files):**
- `apps/api/src/modules/hr/employee-profile/employee-profile.controller.ts` — all 16 routes
- `apps/api/src/modules/hr/employee-profile/employee-profile.service.ts` — orchestrator service
- `apps/api/src/modules/hr/employee-profile/dto/create-hr-note.dto.ts`
- `apps/api/src/modules/hr/employee-profile/dto/create-career-event.dto.ts`
- `apps/api/src/modules/hr/employee-profile/types.ts` — internal type aliases

**API (modify):**
- `apps/api/src/modules/hr/hr.module.ts` — register new controller + service, import sibling modules

**Sibling modules to import (their services need to be exported, see Task 1):**
- `AttendanceModule` (export `AttendanceService`)
- `LeaveModule` (export `LeaveService`)
- `PerformanceReviewsModule` (export `PerformanceReviewsService`)
- `PayrollModule` (export `PayrollService`)
- `OnboardingModule` (export `OnboardingService`)
- `DocumentsModule` (export `DocumentsService`)

If any of these modules don't already export their service, add `exports: [TheirService]` in Task 1.

---

## Endpoint table

| # | Method | Path | Tab / action | Plan task |
|---|---|---|---|---|
| 1 | GET | `/hr/employees/:userId` | Overview + identity | 2 |
| 2 | GET | `/hr/employees/:userId/attendance` | Attendance | 3 |
| 3 | GET | `/hr/employees/:userId/leave` | Leave | 4 |
| 4 | GET | `/hr/employees/:userId/performance` | Performance | 5 |
| 5 | GET | `/hr/employees/:userId/payroll` | Payroll (HR/Finance) | 6 |
| 6 | GET | `/hr/employees/:userId/career` | Career & Promotions | 7 |
| 7 | GET | `/hr/employees/:userId/projects` | Projects & Tasks | 8 |
| 8 | GET | `/hr/employees/:userId/documents` | Documents | 9 |
| 9 | GET | `/hr/employees/:userId/assets` | Assets | 10 |
| 10 | GET | `/hr/employees/:userId/onboarding` | Onboarding | 11 |
| 11 | GET | `/hr/employees/:userId/timeline` | Activity timeline | 12 |
| 12 | GET | `/hr/employees/:userId/notes` | HR notes (HR-only) | 13 |
| 13 | POST | `/hr/employees/:userId/notes` | Add HR note | 14 |
| 14 | DELETE | `/hr/employees/:userId/notes/:noteId` | Delete HR note | 14 |
| 15 | POST | `/hr/employees/:userId/career-events` | Log promotion / transfer | 15 |
| 16 | POST | `/hr/employees/:userId/resend-invite` | Resend invite | 15 |

---

## Task 1: Scaffold `EmployeeProfileController` + `EmployeeProfileService` and wire into module

**Files:**
- Create: `apps/api/src/modules/hr/employee-profile/employee-profile.service.ts`
- Create: `apps/api/src/modules/hr/employee-profile/employee-profile.controller.ts`
- Create: `apps/api/src/modules/hr/employee-profile/types.ts`
- Modify: `apps/api/src/modules/hr/hr.module.ts`
- Modify (only if not already exporting): `apps/api/src/modules/attendance/attendance.module.ts`, `apps/api/src/modules/leave/leave.module.ts`, `apps/api/src/modules/performance-reviews/performance-reviews.module.ts`, `apps/api/src/modules/payroll/payroll.module.ts`, `apps/api/src/modules/onboarding/onboarding.module.ts`, `apps/api/src/modules/documents/documents.module.ts`

- [ ] **Step 1: Create `types.ts`**

```typescript
// apps/api/src/modules/hr/employee-profile/types.ts
import type { Request } from "express";
import type { RoleCode } from "@prisma/client";

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    name?: string;
    roles: RoleCode[];
    permissions?: string[];
  };
}

export interface ResolvedTarget {
  userId: string;     // canonical user id (after resolving "me")
  employeeId: string; // EmployeeProfile.id
}
```

- [ ] **Step 2: Create the service skeleton**

```typescript
// apps/api/src/modules/hr/employee-profile/employee-profile.service.ts
import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { HrPermissionsService } from "../permissions/hr-permissions.service";
import {
  EmployeeAction,
  EmployeeTabKey,
  Relationship,
  ViewerContext,
  ViewerLevel,
} from "../permissions/hr-permissions.types";
import { ResolvedTarget } from "./types";

@Injectable()
export class EmployeeProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly perms: HrPermissionsService,
  ) {}

  /** Resolve `:userId` (or the literal "me") to a canonical (userId, employeeId). */
  async resolveTarget(rawUserId: string, viewerId: string): Promise<ResolvedTarget> {
    const userId = rawUserId === "me" ? viewerId : rawUserId;
    const profile = await this.prisma.employeeProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) {
      throw new NotFoundException("Employee profile not found.");
    }
    return { userId, employeeId: profile.id };
  }

  /** Build a viewer context — convenience wrapper. */
  viewerContext(req: { id: string; roles: RoleCode[] }): ViewerContext {
    return { id: req.id, roles: req.roles };
  }

  /** Compute (level, relationship) and assert tab access; throw 403 otherwise. */
  async requireTabAccess(
    viewer: ViewerContext,
    targetUserId: string,
    tab: EmployeeTabKey,
  ): Promise<{ level: ViewerLevel; relationship: Relationship }> {
    const level = this.perms.viewerLevel(viewer);
    const relationship = await this.perms.relationshipTo(viewer, targetUserId);
    if (!this.perms.canAccessTab(level, relationship, tab)) {
      throw new ForbiddenException(`No access to ${tab} for this employee.`);
    }
    return { level, relationship };
  }

  /** Compute (level, relationship) and assert a write-action; throw 403 otherwise. */
  async requireAction(
    viewer: ViewerContext,
    targetUserId: string,
    action: EmployeeAction,
  ): Promise<{ level: ViewerLevel; relationship: Relationship }> {
    const level = this.perms.viewerLevel(viewer);
    const relationship = await this.perms.relationshipTo(viewer, targetUserId);
    this.perms.assertCanWriteAction(level, relationship, action);
    return { level, relationship };
  }
}
```

- [ ] **Step 3: Create the controller skeleton (no routes yet — just DI wiring + the `viewerFromRequest` helper)**

```typescript
// apps/api/src/modules/hr/employee-profile/employee-profile.controller.ts
import { Controller, UseGuards } from "@nestjs/common";
import type { RoleCode } from "@prisma/client";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../../common/guards/roles.guard";
import { HrPermissionsService } from "../permissions/hr-permissions.service";
import type { ViewerContext } from "../permissions/hr-permissions.types";
import { EmployeeProfileService } from "./employee-profile.service";

interface ReqUser {
  id: string;
  roles: RoleCode[];
}

export function viewerFromRequest(user: ReqUser): ViewerContext {
  return { id: user.id, roles: user.roles ?? [] };
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("hr/employees")
export class EmployeeProfileController {
  constructor(
    private readonly service: EmployeeProfileService,
    private readonly perms: HrPermissionsService,
  ) {}

  // Routes added in Tasks 4-17
}
```

- [ ] **Step 4: Add `exports` arrays to sibling modules (only the ones that don't already export)**

Run this grep to see which modules export their service:

```bash
cd /Users/nifal/Documents/nuro
for m in attendance leave performance-reviews payroll onboarding documents; do
  echo "--- $m ---"
  grep -n "exports:" apps/api/src/modules/$m/$m.module.ts || echo "  NO EXPORTS"
done
```

For every module that says `NO EXPORTS`, edit its `.module.ts` to add `exports: [TheirService]`. Example for attendance:

```typescript
@Module({
  controllers: [AttendanceController],
  providers: [AttendanceService],
  exports: [AttendanceService],   // ← add this line
})
export class AttendanceModule {}
```

Match the existing service class name in each file.

- [ ] **Step 5: Update `apps/api/src/modules/hr/hr.module.ts`**

Replace contents with:

```typescript
import { Module } from "@nestjs/common";
import { MailService } from "../../common/mail/mail.service";
import { AttendanceModule } from "../attendance/attendance.module";
import { DocumentsModule } from "../documents/documents.module";
import { LeaveModule } from "../leave/leave.module";
import { OnboardingModule } from "../onboarding/onboarding.module";
import { PayrollModule } from "../payroll/payroll.module";
import { PerformanceReviewsModule } from "../performance-reviews/performance-reviews.module";
import { EmployeeProfileController } from "./employee-profile/employee-profile.controller";
import { EmployeeProfileService } from "./employee-profile/employee-profile.service";
import { HrController } from "./hr.controller";
import { HrService } from "./hr.service";
import { HrPermissionsService } from "./permissions/hr-permissions.service";

@Module({
  imports: [
    AttendanceModule,
    LeaveModule,
    PerformanceReviewsModule,
    PayrollModule,
    OnboardingModule,
    DocumentsModule,
  ],
  controllers: [HrController, EmployeeProfileController],
  providers: [HrService, HrPermissionsService, MailService, EmployeeProfileService],
  exports: [HrPermissionsService],
})
export class HrModule {}
```

- [ ] **Step 6: Verify build + DI**

```bash
cd /Users/nifal/Documents/nuro/apps/api
npx tsc --noEmit
```

Expected: no output.

```bash
cd /Users/nifal/Documents/nuro
(npm run dev:api &) ; sleep 12 ; pkill -f "nest start" || true
```

Expected: `Nest application successfully started`. If you see "Cannot resolve dependencies of EmployeeProfileService", confirm `HrPermissionsService` is provided in `HrModule` (Plan 1 already wired it). If you see "Cannot resolve dependencies of EmployeeProfileController", confirm sibling modules export their service in Step 4.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/hr/employee-profile apps/api/src/modules/hr/hr.module.ts apps/api/src/modules/attendance/attendance.module.ts apps/api/src/modules/leave/leave.module.ts apps/api/src/modules/performance-reviews/performance-reviews.module.ts apps/api/src/modules/payroll/payroll.module.ts apps/api/src/modules/onboarding/onboarding.module.ts apps/api/src/modules/documents/documents.module.ts
git commit -m "feat(hr): scaffold EmployeeProfileController + service for the 360° API"
```

(Only `git add` the module files that you actually changed — if a sibling module already had `exports`, leave it out.)

---

## Task 2: `GET /hr/employees/:userId` — root + Overview tab

**Files:**
- Modify: `apps/api/src/modules/hr/employee-profile/employee-profile.service.ts`
- Modify: `apps/api/src/modules/hr/employee-profile/employee-profile.controller.ts`

This endpoint loads on page mount and returns the identity header + Overview tab payload. All other tabs lazy-load.

- [ ] **Step 1: Add `getOverview` to the service**

Add this method to `EmployeeProfileService` (after `requireAction`):

```typescript
  async getOverview(viewerCtx: ViewerContext, rawUserId: string) {
    const target = await this.resolveTarget(rawUserId, viewerCtx.id);
    const { level, relationship } = await this.requireTabAccess(viewerCtx, target.userId, "overview");

    const user = await this.prisma.user.findUnique({
      where: { id: target.userId },
      include: {
        employeeProfile: {
          include: {
            manager: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        roles: { include: { role: { select: { code: true, name: true } } } },
      },
    });
    if (!user) throw new NotFoundException("User not found.");

    const profile = user.employeeProfile;
    const managerLabel =
      profile?.manager
        ? `${profile.manager.firstName} ${profile.manager.lastName}`
        : (profile?.managerName ?? null);

    const masked = this.perms.maskOverview(level, relationship, {
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        avatarUrl: user.avatarUrl,
        phone: user.phone,
        status: user.status,
        createdAt: user.createdAt,
      },
      profile: profile
        ? {
            id: profile.id,
            department: profile.department,
            designation: profile.designation,
            employmentType: profile.employmentType,
            joinDate: profile.joinDate,
            salary: profile.salary,
            hourlyRate: profile.hourlyRate,
            managerId: profile.managerId,
            emergencyContact: profile.emergencyContact,
            performanceScore: profile.performanceScore,
            terminatedAt: profile.terminatedAt,
          }
        : null,
      managerLabel,
    });

    const accessibleTabs: EmployeeTabKey[] = (
      ["overview","attendance","leave","performance","payroll","career","projects","documents","assets","onboarding","timeline","notes"] as const
    ).filter((t) => this.perms.canAccessTab(level, relationship, t));

    return {
      ...masked,
      roles: user.roles.map((r) => ({ code: r.role.code, name: r.role.name })),
      accessibleTabs,
    };
  }
```

You'll need to add `EmployeeTabKey` to the imports at the top of the service if it isn't already imported.

- [ ] **Step 2: Add the controller route**

In `EmployeeProfileController`, add inside the class (after the constructor):

```typescript
  @Get(":userId")
  getOverview(@Param("userId") userId: string, @CurrentUser() user: { id: string; roles: RoleCode[] }) {
    return this.service.getOverview(viewerFromRequest(user), userId);
  }
```

Add the imports needed at the top of the file:

```typescript
import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../../common/decorators/current-user.decorator";
import type { RoleCode } from "@prisma/client";
```

(Replace the existing `import { Controller, UseGuards } from "@nestjs/common";` line.)

- [ ] **Step 3: Verify build**

```bash
cd /Users/nifal/Documents/nuro/apps/api && npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 4: Smoke-test the route**

Boot API, log in as HR, hit the route. Use the seed user `hr@nuro7.com` / `ChangeMe123!`:

```bash
cd /Users/nifal/Documents/nuro && npm run dev:api &
sleep 12

TOKEN=$(curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H "content-type: application/json" \
  -d '{"email":"hr@nuro7.com","password":"ChangeMe123!"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

# Self overview
curl -s http://localhost:4000/api/v1/hr/employees/me \
  -H "authorization: Bearer $TOKEN" | python3 -m json.tool | head -30

pkill -f "nest start" || true
```

Expected: a JSON response with `userId`, `firstName`, `lastName`, `salary` (visible because viewer is HR), `accessibleTabs` array of 12 tab keys.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/hr/employee-profile
git commit -m "feat(hr): GET /hr/employees/:userId returns masked Overview + accessibleTabs"
```

---

## Task 3: `GET /hr/employees/:userId/attendance` — Attendance tab

- [ ] **Step 1: Inject `AttendanceService` into `EmployeeProfileService`**

Add to imports:

```typescript
import { AttendanceService } from "../../attendance/attendance.service";
```

Update the constructor:

```typescript
  constructor(
    private readonly prisma: PrismaService,
    private readonly perms: HrPermissionsService,
    private readonly attendance: AttendanceService,
  ) {}
```

- [ ] **Step 2: Add `getAttendance` method**

```typescript
  async getAttendance(viewerCtx: ViewerContext, rawUserId: string) {
    const target = await this.resolveTarget(rawUserId, viewerCtx.id);
    await this.requireTabAccess(viewerCtx, target.userId, "attendance");
    const records = await this.attendance.list(target.userId);
    return { records };
  }
```

- [ ] **Step 3: Add the controller route**

In `EmployeeProfileController` after the existing `getOverview` route:

```typescript
  @Get(":userId/attendance")
  getAttendance(@Param("userId") userId: string, @CurrentUser() user: { id: string; roles: RoleCode[] }) {
    return this.service.getAttendance(viewerFromRequest(user), userId);
  }
```

- [ ] **Step 4: Build + smoke**

```bash
cd /Users/nifal/Documents/nuro/apps/api && npx tsc --noEmit
```

```bash
# After booting API and getting TOKEN as in Task 2 Step 4:
curl -s http://localhost:4000/api/v1/hr/employees/me/attendance \
  -H "authorization: Bearer $TOKEN" | python3 -m json.tool | head -10
```

Expected: `{ "records": [...] }` — possibly empty for the HR seed user, that's fine. Status 200.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/hr/employee-profile
git commit -m "feat(hr): GET /hr/employees/:userId/attendance"
```

---

## Task 4: `GET /hr/employees/:userId/leave` — Leave tab

- [ ] **Step 1: Inject `LeaveService` into `EmployeeProfileService`**

Add to imports:

```typescript
import { LeaveService } from "../../leave/leave.service";
```

Add to constructor:

```typescript
    private readonly leave: LeaveService,
```

- [ ] **Step 2: Add `getLeave` method**

```typescript
  async getLeave(viewerCtx: ViewerContext, rawUserId: string) {
    const target = await this.resolveTarget(rawUserId, viewerCtx.id);
    await this.requireTabAccess(viewerCtx, target.userId, "leave");
    const [requests, balances] = await Promise.all([
      this.leave.list(target.userId),
      this.leave.balances(target.userId),
    ]);
    return { requests, balances };
  }
```

- [ ] **Step 3: Add controller route**

```typescript
  @Get(":userId/leave")
  getLeave(@Param("userId") userId: string, @CurrentUser() user: { id: string; roles: RoleCode[] }) {
    return this.service.getLeave(viewerFromRequest(user), userId);
  }
```

- [ ] **Step 4: Build + smoke**

```bash
cd /Users/nifal/Documents/nuro/apps/api && npx tsc --noEmit
```

```bash
curl -s http://localhost:4000/api/v1/hr/employees/me/leave \
  -H "authorization: Bearer $TOKEN" | python3 -m json.tool | head -15
```

Expected: `{ "requests": [...], "balances": [...] }`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/hr/employee-profile
git commit -m "feat(hr): GET /hr/employees/:userId/leave (requests + balances)"
```

---

## Task 5: `GET /hr/employees/:userId/performance` — Performance tab

- [ ] **Step 1: Add `getPerformance` method**

(No new service injection — this one queries Prisma directly because `PerformanceReviewsService` may not have a `forUser` helper.)

```typescript
  async getPerformance(viewerCtx: ViewerContext, rawUserId: string) {
    const target = await this.resolveTarget(rawUserId, viewerCtx.id);
    await this.requireTabAccess(viewerCtx, target.userId, "performance");

    const [reviews, goals] = await Promise.all([
      this.prisma.performanceReview.findMany({
        where: { userId: target.userId },
        orderBy: { createdAt: "desc" },
        include: { reviewer: { select: { id: true, firstName: true, lastName: true } } },
      }),
      this.prisma.goal.findMany({
        where: { assigneeId: target.userId },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return { reviews, goals };
  }
```

- [ ] **Step 2: Add controller route**

```typescript
  @Get(":userId/performance")
  getPerformance(@Param("userId") userId: string, @CurrentUser() user: { id: string; roles: RoleCode[] }) {
    return this.service.getPerformance(viewerFromRequest(user), userId);
  }
```

- [ ] **Step 3: Verify**

```bash
cd /Users/nifal/Documents/nuro/apps/api && npx tsc --noEmit
```

If `performanceReview.userId` doesn't exist in the schema, find the correct field name (probably `userId`, `employeeId`, or `revieweeId`) by `grep -n "model PerformanceReview" -A 25 packages/db/prisma/schema.prisma` and adjust. Same for `Goal.assigneeId`.

Smoke test (after boot + TOKEN):

```bash
curl -s http://localhost:4000/api/v1/hr/employees/me/performance \
  -H "authorization: Bearer $TOKEN" | python3 -m json.tool | head -15
```

Expected: `{ "reviews": [...], "goals": [...] }`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/hr/employee-profile
git commit -m "feat(hr): GET /hr/employees/:userId/performance (reviews + goals)"
```

---

## Task 6: `GET /hr/employees/:userId/payroll` — Payroll tab (HR/Finance only)

- [ ] **Step 1: Add `getPayroll` method**

```typescript
  async getPayroll(viewerCtx: ViewerContext, rawUserId: string) {
    const target = await this.resolveTarget(rawUserId, viewerCtx.id);
    await this.requireTabAccess(viewerCtx, target.userId, "payroll");

    const [salaryStructure, paySlips] = await Promise.all([
      this.prisma.salaryStructure.findUnique({ where: { employeeId: target.employeeId } }),
      this.prisma.paySlip.findMany({
        where: { employeeId: target.employeeId },
        orderBy: [{ year: "desc" }, { month: "desc" }],
        take: 36,
      }),
    ]);
    return { salaryStructure, paySlips };
  }
```

- [ ] **Step 2: Add controller route**

```typescript
  @Get(":userId/payroll")
  getPayroll(@Param("userId") userId: string, @CurrentUser() user: { id: string; roles: RoleCode[] }) {
    return this.service.getPayroll(viewerFromRequest(user), userId);
  }
```

- [ ] **Step 3: Verify**

```bash
cd /Users/nifal/Documents/nuro/apps/api && npx tsc --noEmit
```

```bash
curl -s http://localhost:4000/api/v1/hr/employees/me/payroll \
  -H "authorization: Bearer $TOKEN" | python3 -m json.tool | head -10
```

Expected: HR sees `{ "salaryStructure": null, "paySlips": [] }` (data may be empty). Test as a non-HR user (e.g., login as `engineer@nuro7.com` / `ChangeMe123!`) and confirm 403:

```bash
ENG_TOKEN=$(curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H "content-type: application/json" \
  -d '{"email":"engineer@nuro7.com","password":"ChangeMe123!"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

curl -s -i http://localhost:4000/api/v1/hr/employees/me/payroll \
  -H "authorization: Bearer $ENG_TOKEN" | head -3
```

Expected: HTTP 403.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/hr/employee-profile
git commit -m "feat(hr): GET /hr/employees/:userId/payroll (HR/Finance only)"
```

---

## Task 7: `GET /hr/employees/:userId/career` — Career & Promotions tab

- [ ] **Step 1: Add `getCareer` method**

```typescript
  async getCareer(viewerCtx: ViewerContext, rawUserId: string) {
    const target = await this.resolveTarget(rawUserId, viewerCtx.id);
    await this.requireTabAccess(viewerCtx, target.userId, "career");

    const [promotions, statusEvents] = await Promise.all([
      this.prisma.promotionHistory.findMany({
        where: { employeeId: target.employeeId },
        orderBy: { effectiveDate: "desc" },
      }),
      this.prisma.employmentStatusEvent.findMany({
        where: { employeeId: target.employeeId },
        orderBy: { effectiveDate: "desc" },
        include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
      }),
    ]);

    // Merge into a single chronological stream with a uniform shape.
    type CareerRow = {
      kind: "PROMOTION" | "STATUS_EVENT";
      id: string;
      effectiveDate: Date;
      summary: string;
      details?: string | null;
    };
    const rows: CareerRow[] = [
      ...promotions.map((p) => ({
        kind: "PROMOTION" as const,
        id: p.id,
        effectiveDate: p.effectiveDate,
        summary: `Promoted from ${p.previousTitle} to ${p.newTitle}`,
        details: p.notes,
      })),
      ...statusEvents.map((e) => ({
        kind: "STATUS_EVENT" as const,
        id: e.id,
        effectiveDate: e.effectiveDate,
        summary:
          e.type === "HIRED"
            ? `Hired as ${e.toValue ?? ""}`.trim()
            : e.type === "TERMINATED"
              ? `Terminated`
              : e.fromValue && e.toValue
                ? `${e.type}: ${e.fromValue} → ${e.toValue}`
                : `${e.type}`,
        details: e.reason,
      })),
    ].sort((a, b) => b.effectiveDate.getTime() - a.effectiveDate.getTime());

    return { entries: rows };
  }
```

- [ ] **Step 2: Add controller route**

```typescript
  @Get(":userId/career")
  getCareer(@Param("userId") userId: string, @CurrentUser() user: { id: string; roles: RoleCode[] }) {
    return this.service.getCareer(viewerFromRequest(user), userId);
  }
```

- [ ] **Step 3: Verify**

```bash
cd /Users/nifal/Documents/nuro/apps/api && npx tsc --noEmit
```

```bash
curl -s http://localhost:4000/api/v1/hr/employees/me/career \
  -H "authorization: Bearer $TOKEN" | python3 -m json.tool | head -10
```

Expected: `{ "entries": [...] }` with at least one `STATUS_EVENT` row of type HIRED for the HR user.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/hr/employee-profile
git commit -m "feat(hr): GET /hr/employees/:userId/career (promotions + status events merged)"
```

---

## Task 8: `GET /hr/employees/:userId/projects` — Projects & Tasks tab

- [ ] **Step 1: Add `getProjects` method**

```typescript
  async getProjects(viewerCtx: ViewerContext, rawUserId: string) {
    const target = await this.resolveTarget(rawUserId, viewerCtx.id);
    await this.requireTabAccess(viewerCtx, target.userId, "projects");

    const [memberships, managedProjects, openTasks, completedTaskCount] = await Promise.all([
      this.prisma.projectMember.findMany({
        where: { userId: target.userId },
        include: {
          project: { select: { id: true, name: true, status: true, startDate: true, endDate: true } },
        },
      }),
      this.prisma.project.findMany({
        where: { managerId: target.userId },
        select: { id: true, name: true, status: true, startDate: true, endDate: true },
      }),
      this.prisma.task.findMany({
        where: { assigneeId: target.userId, status: { not: "DONE" } },
        select: {
          id: true,
          title: true,
          status: true,
          dueDate: true,
          project: { select: { id: true, name: true } },
        },
        orderBy: { dueDate: "asc" },
        take: 50,
      }),
      this.prisma.task.count({ where: { assigneeId: target.userId, status: "DONE" } }),
    ]);

    const projects = [
      ...memberships.map((m) => ({ ...m.project, role: "MEMBER" as const })),
      ...managedProjects.map((p) => ({ ...p, role: "MANAGER" as const })),
    ];

    return { projects, openTasks, completedTaskCount };
  }
```

If the `Task.status` field uses an enum where the "done" value is named differently (e.g. `COMPLETED`), grep `enum TaskStatus` in the schema and adjust both occurrences.

- [ ] **Step 2: Add controller route**

```typescript
  @Get(":userId/projects")
  getProjects(@Param("userId") userId: string, @CurrentUser() user: { id: string; roles: RoleCode[] }) {
    return this.service.getProjects(viewerFromRequest(user), userId);
  }
```

- [ ] **Step 3: Verify**

```bash
cd /Users/nifal/Documents/nuro/apps/api && npx tsc --noEmit
```

```bash
curl -s http://localhost:4000/api/v1/hr/employees/me/projects \
  -H "authorization: Bearer $TOKEN" | python3 -m json.tool | head -10
```

Expected: 200 with `projects`, `openTasks`, `completedTaskCount`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/hr/employee-profile
git commit -m "feat(hr): GET /hr/employees/:userId/projects (memberships + managed + tasks)"
```

---

## Task 9: `GET /hr/employees/:userId/documents` — Documents tab (read-only)

- [ ] **Step 1: Add `getDocuments` method**

```typescript
  async getDocuments(viewerCtx: ViewerContext, rawUserId: string) {
    const target = await this.resolveTarget(rawUserId, viewerCtx.id);
    await this.requireTabAccess(viewerCtx, target.userId, "documents");
    const documents = await this.prisma.employeeDocument.findMany({
      where: { employeeId: target.employeeId },
      orderBy: { createdAt: "desc" },
    });
    return { documents };
  }
```

- [ ] **Step 2: Add controller route**

```typescript
  @Get(":userId/documents")
  getDocuments(@Param("userId") userId: string, @CurrentUser() user: { id: string; roles: RoleCode[] }) {
    return this.service.getDocuments(viewerFromRequest(user), userId);
  }
```

- [ ] **Step 3: Verify**

```bash
cd /Users/nifal/Documents/nuro/apps/api && npx tsc --noEmit
```

```bash
curl -s http://localhost:4000/api/v1/hr/employees/me/documents \
  -H "authorization: Bearer $TOKEN" | python3 -m json.tool | head -5
```

Expected: `{ "documents": [] }` (likely empty in seed).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/hr/employee-profile
git commit -m "feat(hr): GET /hr/employees/:userId/documents (read)"
```

---

## Task 10: `GET /hr/employees/:userId/assets` — Assets tab

- [ ] **Step 1: Add `getAssets` method**

```typescript
  async getAssets(viewerCtx: ViewerContext, rawUserId: string) {
    const target = await this.resolveTarget(rawUserId, viewerCtx.id);
    await this.requireTabAccess(viewerCtx, target.userId, "assets");
    const assets = await this.prisma.asset.findMany({
      where: { assignedToId: target.userId },
      orderBy: { assignedAt: "desc" },
    });
    return { assets };
  }
```

- [ ] **Step 2: Add controller route**

```typescript
  @Get(":userId/assets")
  getAssets(@Param("userId") userId: string, @CurrentUser() user: { id: string; roles: RoleCode[] }) {
    return this.service.getAssets(viewerFromRequest(user), userId);
  }
```

- [ ] **Step 3: Verify**

```bash
cd /Users/nifal/Documents/nuro/apps/api && npx tsc --noEmit
```

```bash
curl -s http://localhost:4000/api/v1/hr/employees/me/assets \
  -H "authorization: Bearer $TOKEN" | python3 -m json.tool | head -5
```

Expected: `{ "assets": [...] }`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/hr/employee-profile
git commit -m "feat(hr): GET /hr/employees/:userId/assets"
```

---

## Task 11: `GET /hr/employees/:userId/onboarding` — Onboarding tab

- [ ] **Step 1: Add `getOnboarding` method**

```typescript
  async getOnboarding(viewerCtx: ViewerContext, rawUserId: string) {
    const target = await this.resolveTarget(rawUserId, viewerCtx.id);
    await this.requireTabAccess(viewerCtx, target.userId, "onboarding");

    // Items assigned to this user across all checklists.
    const items = await this.prisma.onboardingItem.findMany({
      where: { assigneeId: target.userId },
      include: { checklist: { select: { id: true, title: true, description: true } } },
      orderBy: [{ checklistId: "asc" }, { sortOrder: "asc" }],
    });

    // Group by checklist for the UI.
    const byChecklist = new Map<string, { id: string; title: string; description: string | null; items: typeof items }>();
    for (const it of items) {
      const key = it.checklistId;
      if (!byChecklist.has(key)) {
        byChecklist.set(key, {
          id: it.checklist.id,
          title: it.checklist.title,
          description: it.checklist.description,
          items: [],
        });
      }
      byChecklist.get(key)!.items.push(it);
    }
    return { checklists: Array.from(byChecklist.values()) };
  }
```

- [ ] **Step 2: Add controller route**

```typescript
  @Get(":userId/onboarding")
  getOnboarding(@Param("userId") userId: string, @CurrentUser() user: { id: string; roles: RoleCode[] }) {
    return this.service.getOnboarding(viewerFromRequest(user), userId);
  }
```

- [ ] **Step 3: Verify**

```bash
cd /Users/nifal/Documents/nuro/apps/api && npx tsc --noEmit
```

```bash
curl -s http://localhost:4000/api/v1/hr/employees/me/onboarding \
  -H "authorization: Bearer $TOKEN" | python3 -m json.tool | head -10
```

Expected: `{ "checklists": [] }` for the HR user (no onboarding assigned).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/hr/employee-profile
git commit -m "feat(hr): GET /hr/employees/:userId/onboarding"
```

---

## Task 12: `GET /hr/employees/:userId/timeline` — Activity timeline tab

This merges several event sources into one chronological stream.

- [ ] **Step 1: Add `getTimeline` method**

```typescript
  async getTimeline(viewerCtx: ViewerContext, rawUserId: string, limit = 50) {
    const target = await this.resolveTarget(rawUserId, viewerCtx.id);
    await this.requireTabAccess(viewerCtx, target.userId, "timeline");

    const [statusEvents, leaves, reviews, promotions, docs] = await Promise.all([
      this.prisma.employmentStatusEvent.findMany({
        where: { employeeId: target.employeeId },
        orderBy: { effectiveDate: "desc" },
        take: limit,
      }),
      this.prisma.leaveRequest.findMany({
        where: { userId: target.userId },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      this.prisma.performanceReview.findMany({
        where: { userId: target.userId },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      this.prisma.promotionHistory.findMany({
        where: { employeeId: target.employeeId },
        orderBy: { effectiveDate: "desc" },
        take: limit,
      }),
      this.prisma.employeeDocument.findMany({
        where: { employeeId: target.employeeId },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
    ]);

    type TimelineEntry = {
      kind: "STATUS_EVENT" | "LEAVE" | "REVIEW" | "PROMOTION" | "DOCUMENT";
      id: string;
      at: Date;
      summary: string;
      details?: string | null;
    };
    const entries: TimelineEntry[] = [
      ...statusEvents.map((e) => ({
        kind: "STATUS_EVENT" as const,
        id: e.id,
        at: e.effectiveDate,
        summary: e.type,
        details: e.reason,
      })),
      ...leaves.map((l) => ({
        kind: "LEAVE" as const,
        id: l.id,
        at: l.createdAt,
        summary: `Leave ${l.status.toLowerCase()}: ${l.leaveType}`,
        details: l.reason,
      })),
      ...reviews.map((r) => ({
        kind: "REVIEW" as const,
        id: r.id,
        at: r.createdAt,
        summary: `Performance review`,
        details: null,
      })),
      ...promotions.map((p) => ({
        kind: "PROMOTION" as const,
        id: p.id,
        at: p.effectiveDate,
        summary: `Promoted to ${p.newTitle}`,
        details: p.notes,
      })),
      ...docs.map((d) => ({
        kind: "DOCUMENT" as const,
        id: d.id,
        at: d.createdAt,
        summary: `Document uploaded: ${d.title}`,
      })),
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, limit);

    return { entries };
  }
```

If a field name above doesn't match the schema (e.g. `LeaveRequest.userId` might be `requesterId`), grep the schema and adjust.

- [ ] **Step 2: Add controller route**

```typescript
  @Get(":userId/timeline")
  getTimeline(@Param("userId") userId: string, @CurrentUser() user: { id: string; roles: RoleCode[] }) {
    return this.service.getTimeline(viewerFromRequest(user), userId);
  }
```

- [ ] **Step 3: Verify**

```bash
cd /Users/nifal/Documents/nuro/apps/api && npx tsc --noEmit
```

```bash
curl -s http://localhost:4000/api/v1/hr/employees/me/timeline \
  -H "authorization: Bearer $TOKEN" | python3 -m json.tool | head -15
```

Expected: `{ "entries": [...] }` with at least one STATUS_EVENT (HIRED).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/hr/employee-profile
git commit -m "feat(hr): GET /hr/employees/:userId/timeline (multi-source merge)"
```

---

## Task 13: `GET /hr/employees/:userId/notes` — HR Notes tab (read)

- [ ] **Step 1: Add `getNotes` method**

```typescript
  async getNotes(viewerCtx: ViewerContext, rawUserId: string) {
    const target = await this.resolveTarget(rawUserId, viewerCtx.id);
    await this.requireTabAccess(viewerCtx, target.userId, "notes");
    const notes = await this.prisma.hrNote.findMany({
      where: { employeeId: target.employeeId },
      include: { author: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: "desc" },
    });
    return { notes };
  }
```

- [ ] **Step 2: Add controller route**

```typescript
  @Get(":userId/notes")
  getNotes(@Param("userId") userId: string, @CurrentUser() user: { id: string; roles: RoleCode[] }) {
    return this.service.getNotes(viewerFromRequest(user), userId);
  }
```

- [ ] **Step 3: Verify**

```bash
cd /Users/nifal/Documents/nuro/apps/api && npx tsc --noEmit
```

```bash
# As HR — should get the seeded note
curl -s http://localhost:4000/api/v1/hr/employees/me/notes \
  -H "authorization: Bearer $TOKEN" | python3 -m json.tool | head -10

# As engineer — should be 403
curl -s -i http://localhost:4000/api/v1/hr/employees/me/notes \
  -H "authorization: Bearer $ENG_TOKEN" | head -3
```

Expected: HR sees `{ "notes": [...] }` with at least 1 note (from seed). Engineer gets HTTP 403.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/hr/employee-profile
git commit -m "feat(hr): GET /hr/employees/:userId/notes (HR-only)"
```

---

## Task 14: `POST` and `DELETE` for HR Notes

- [ ] **Step 1: Create `CreateHrNoteDto`**

```typescript
// apps/api/src/modules/hr/employee-profile/dto/create-hr-note.dto.ts
import { IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { HrNoteCategory } from "@prisma/client";

export class CreateHrNoteDto {
  @IsString()
  @MinLength(1)
  body!: string;

  @IsOptional()
  @IsEnum(HrNoteCategory)
  category?: HrNoteCategory;
}
```

- [ ] **Step 2: Add service methods**

```typescript
  async addNote(viewerCtx: ViewerContext, rawUserId: string, dto: { body: string; category?: import("@prisma/client").HrNoteCategory }) {
    const target = await this.resolveTarget(rawUserId, viewerCtx.id);
    await this.requireAction(viewerCtx, target.userId, "ADD_HR_NOTE");
    return this.prisma.hrNote.create({
      data: {
        employeeId: target.employeeId,
        authorId: viewerCtx.id,
        body: dto.body,
        category: dto.category ?? "GENERAL",
      },
      include: { author: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  async deleteNote(viewerCtx: ViewerContext, rawUserId: string, noteId: string) {
    const target = await this.resolveTarget(rawUserId, viewerCtx.id);
    await this.requireAction(viewerCtx, target.userId, "DELETE_HR_NOTE");
    const note = await this.prisma.hrNote.findUnique({ where: { id: noteId } });
    if (!note || note.employeeId !== target.employeeId) {
      throw new NotFoundException("Note not found.");
    }
    await this.prisma.hrNote.delete({ where: { id: noteId } });
    return { success: true };
  }
```

- [ ] **Step 3: Add controller routes**

```typescript
  @Post(":userId/notes")
  addNote(
    @Param("userId") userId: string,
    @Body() dto: CreateHrNoteDto,
    @CurrentUser() user: { id: string; roles: RoleCode[] },
  ) {
    return this.service.addNote(viewerFromRequest(user), userId, dto);
  }

  @Delete(":userId/notes/:noteId")
  deleteNote(
    @Param("userId") userId: string,
    @Param("noteId") noteId: string,
    @CurrentUser() user: { id: string; roles: RoleCode[] },
  ) {
    return this.service.deleteNote(viewerFromRequest(user), userId, noteId);
  }
```

Add to controller imports: `Body`, `Delete`, `Post` from `@nestjs/common`, and `CreateHrNoteDto` from the new DTO file.

- [ ] **Step 4: Verify**

```bash
cd /Users/nifal/Documents/nuro/apps/api && npx tsc --noEmit
```

```bash
# Add a note (HR)
NOTE=$(curl -s -X POST http://localhost:4000/api/v1/hr/employees/me/notes \
  -H "authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"body":"Smoke test note","category":"KUDOS"}')
echo "$NOTE" | python3 -m json.tool | head -10

# Extract id and delete it
NOTE_ID=$(echo "$NOTE" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
curl -s -X DELETE http://localhost:4000/api/v1/hr/employees/me/notes/$NOTE_ID \
  -H "authorization: Bearer $TOKEN" | python3 -m json.tool

# Engineer tries to add a note → 403
curl -s -i -X POST http://localhost:4000/api/v1/hr/employees/me/notes \
  -H "authorization: Bearer $ENG_TOKEN" -H "content-type: application/json" \
  -d '{"body":"forbidden"}' | head -3
```

Expected: POST returns the new note JSON; DELETE returns `{"success": true}`; engineer POST returns 403.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/hr/employee-profile
git commit -m "feat(hr): POST/DELETE /hr/employees/:userId/notes (HR-only)"
```

---

## Task 15: Career events POST + Resend invite POST

These two are both small HR-only mutations; bundling them into one task.

- [ ] **Step 1: Create `CreateCareerEventDto`**

```typescript
// apps/api/src/modules/hr/employee-profile/dto/create-career-event.dto.ts
import { IsDateString, IsEnum, IsOptional, IsString } from "class-validator";
import { EmploymentEventType } from "@prisma/client";

export class CreateCareerEventDto {
  @IsEnum(EmploymentEventType)
  type!: EmploymentEventType;

  @IsOptional()
  @IsString()
  fromValue?: string;

  @IsOptional()
  @IsString()
  toValue?: string;

  @IsDateString()
  effectiveDate!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
```

- [ ] **Step 2: Add `addCareerEvent` method**

```typescript
  async addCareerEvent(viewerCtx: ViewerContext, rawUserId: string, dto: import("./dto/create-career-event.dto").CreateCareerEventDto) {
    const target = await this.resolveTarget(rawUserId, viewerCtx.id);
    await this.requireAction(viewerCtx, target.userId, "LOG_CAREER_EVENT");

    const event = await this.prisma.employmentStatusEvent.create({
      data: {
        employeeId: target.employeeId,
        type: dto.type,
        fromValue: dto.fromValue,
        toValue: dto.toValue,
        effectiveDate: new Date(dto.effectiveDate),
        reason: dto.reason,
        createdById: viewerCtx.id,
      },
    });

    // If it's a PROMOTED event with toValue, also bump the EmployeeProfile.designation.
    if (dto.type === "PROMOTED" && dto.toValue) {
      await this.prisma.employeeProfile.update({
        where: { id: target.employeeId },
        data: { designation: dto.toValue },
      });
    }

    return event;
  }
```

- [ ] **Step 3: Add `resendInvite` method**

```typescript
  async resendInvite(viewerCtx: ViewerContext, rawUserId: string) {
    const target = await this.resolveTarget(rawUserId, viewerCtx.id);
    await this.requireAction(viewerCtx, target.userId, "RESEND_INVITE");
    const user = await this.prisma.user.findUnique({
      where: { id: target.userId },
      select: { id: true, email: true, firstName: true, lastName: true, status: true },
    });
    if (!user) throw new NotFoundException("User not found.");
    if (user.status !== "INVITED") {
      // Not strictly an error, but signal back so the UI can render an info toast.
      return { success: false, reason: `User status is ${user.status}, no invite to resend.` };
    }
    // The MailService is currently a stub; this just logs. In Plan 1 we already
    // imported MailService into HrModule. We don't have it here — inject by adding
    // it to the constructor.
    return { success: true, message: "Invite re-issued." };
  }
```

Note: this implementation does NOT actually trigger an email send (since we'd need to issue a new temp password and that's a significant feature on its own). It just returns a success indicator. A real send is a follow-up. The `MailService` injection is therefore not added here — the response is purely advisory.

- [ ] **Step 4: Add controller routes**

```typescript
  @Post(":userId/career-events")
  addCareerEvent(
    @Param("userId") userId: string,
    @Body() dto: CreateCareerEventDto,
    @CurrentUser() user: { id: string; roles: RoleCode[] },
  ) {
    return this.service.addCareerEvent(viewerFromRequest(user), userId, dto);
  }

  @Post(":userId/resend-invite")
  resendInvite(@Param("userId") userId: string, @CurrentUser() user: { id: string; roles: RoleCode[] }) {
    return this.service.resendInvite(viewerFromRequest(user), userId);
  }
```

Add `CreateCareerEventDto` to the imports.

- [ ] **Step 5: Verify**

```bash
cd /Users/nifal/Documents/nuro/apps/api && npx tsc --noEmit
```

```bash
# Pick an existing employee to log an event against. Use the engineer's userId:
ENG_USER_ID=$(curl -s http://localhost:4000/api/v1/auth/login \
  -X POST -H "content-type: application/json" \
  -d '{"email":"engineer@nuro7.com","password":"ChangeMe123!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['id'])")

# HR logs a promotion for the engineer
curl -s -X POST http://localhost:4000/api/v1/hr/employees/$ENG_USER_ID/career-events \
  -H "authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"type":"PROMOTED","fromValue":"Software Engineer","toValue":"Senior Engineer","effectiveDate":"2026-05-05","reason":"Strong year"}' \
  | python3 -m json.tool | head -10

# Resend invite (not INVITED status, so should return success:false)
curl -s -X POST http://localhost:4000/api/v1/hr/employees/$ENG_USER_ID/resend-invite \
  -H "authorization: Bearer $TOKEN" | python3 -m json.tool
```

Expected: career-events POST returns the new event; promotion bumps designation in DB. Resend-invite returns `{"success": false, "reason": "User status is ACTIVE, no invite to resend."}`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/hr/employee-profile
git commit -m "feat(hr): POST /hr/employees/:userId/career-events and resend-invite"
```

---

## Task 16: Final smoke test of all endpoints

- [ ] **Step 1: Boot API and run all endpoints in one curl script**

```bash
cd /Users/nifal/Documents/nuro
npm run dev:api &
sleep 12

TOKEN=$(curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H "content-type: application/json" \
  -d '{"email":"hr@nuro7.com","password":"ChangeMe123!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

for path in "" "/attendance" "/leave" "/performance" "/payroll" "/career" "/projects" "/documents" "/assets" "/onboarding" "/timeline" "/notes"; do
  code=$(curl -s -o /tmp/resp -w "%{http_code}" \
    "http://localhost:4000/api/v1/hr/employees/me$path" \
    -H "authorization: Bearer $TOKEN")
  echo "$code  /hr/employees/me$path"
done

pkill -f "nest start" || true
```

Expected: every line shows `200`.

- [ ] **Step 2: Spot-check 403 enforcement**

```bash
ENG_TOKEN=$(curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H "content-type: application/json" \
  -d '{"email":"engineer@nuro7.com","password":"ChangeMe123!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

# As engineer, payroll and notes should return 403
for path in "/payroll" "/notes"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" \
    "http://localhost:4000/api/v1/hr/employees/me$path" \
    -H "authorization: Bearer $ENG_TOKEN")
  echo "$code  engineer → /hr/employees/me$path"
done
```

Expected: both lines show `403`.

- [ ] **Step 3: No commit needed for the smoke test itself.** If anything failed, file a fix task and address.

---

## What's done at the end of this plan

✅ 14 GET endpoints + 2 POST + 1 DELETE for the entire Employee 360° backend, all permission-aware via `HrPermissionsService`.
✅ `me`-alias support across every endpoint (self-service ready for the UI).
✅ 403 enforcement verified for non-HR viewers on payroll and notes.
✅ Career events can be logged by HR; promotions automatically bump the employee's designation.
✅ Resend-invite endpoint stub returns the right status.

## What's NOT in this plan

- **Document upload/delete** (POST/DELETE on `/documents`). Requires multer + storage abstraction integration; deserves its own focused task (Plan 2C).
- **Real email send for resend-invite.** `MailService` is currently a stub; once a real transport ships, this endpoint can issue a fresh temp password.
- **Frontend** (Plan 2B): the page route, header, quick-stats, tab bar, and 12 tab components consume these endpoints.
- **Inline approve/reject for leave** from the Manager view — the data is exposed by `/leave` endpoint but the action UI is in Plan 3 (HR Hub).
