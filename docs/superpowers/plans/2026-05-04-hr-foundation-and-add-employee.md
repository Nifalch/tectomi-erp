# HR Foundation + Add Employee — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the data-model + permission foundation, then ship an end-to-end "+ Add Employee" flow on top of it.

**Architecture:** Orchestrator + delegation. The HR NestJS module owns its own controller/service plus a `HrPermissionsService` reused everywhere. New employees are created in a single Prisma transaction (User → roles → EmployeeProfile → optional onboarding clone). The frontend `<AddEmployeeDialog>` follows the existing `<EmployeeEditDialog>` shape and calls a new `useCreateEmployee()` mutation hook.

**Tech Stack:** NestJS 11, Prisma 6, PostgreSQL, class-validator/class-transformer, Next.js App Router (apps/web), TanStack Query, Zustand auth store, shadcn-style UI primitives.

**Spec:** [docs/superpowers/specs/2026-05-04-hr-operations-system-design.md](../specs/2026-05-04-hr-operations-system-design.md)

**Verification model (no test framework installed yet):** every task ends with `npm run lint --workspaces --if-present` and a `tsc --noEmit` for the workspace touched. Feature tasks add an explicit browser smoke-check.

**Project working directory:** `/Users/nifal/Documents/nuro`

---

## File map

**API (NestJS):**
- Modify: `packages/db/prisma/schema.prisma` — schema additions
- Create: `packages/db/prisma/migrations/<timestamp>_hr_foundation/migration.sql` (Prisma generates)
- Modify: `packages/db/prisma/seed.ts` — seed an extra employee + relations
- Create: `apps/api/src/modules/hr/permissions/hr-permissions.service.ts`
- Create: `apps/api/src/modules/hr/permissions/hr-permissions.types.ts`
- Modify: `apps/api/src/modules/hr/hr.module.ts` — provide `HrPermissionsService`
- Create: `apps/api/src/modules/hr/dto/create-employee.dto.ts`
- Modify: `apps/api/src/modules/hr/hr.service.ts` — add `createEmployee`
- Modify: `apps/api/src/modules/hr/hr.controller.ts` — add `POST /hr/employees`

**Web (Next.js):**
- Modify: `apps/web/lib/api/mutations.ts` — add `useCreateEmployee`
- Create: `apps/web/components/hr/add-employee-dialog.tsx`
- Modify: `apps/web/app/(dashboard)/hr/page.tsx` — wire "+ Add Employee" button
- Modify: `apps/web/lib/api/hooks.ts` — invalidate key updates only if needed

---

## Task 0: Initialize git (skip if already a repo)

**Files:** none (repo-level)

- [ ] **Step 1: Check if repo is initialized**

```bash
git -C /Users/nifal/Documents/nuro rev-parse --is-inside-work-tree 2>/dev/null && echo "already a repo" || echo "needs init"
```

If output is `already a repo`, skip this task entirely.

- [ ] **Step 2: Initialize and stage current state**

Only if Step 1 said `needs init`:

```bash
cd /Users/nifal/Documents/nuro
git init
git add .gitignore .env.example README.md package.json package-lock.json tsconfig.base.json docker-compose.yml nginx apps packages docs
git commit -m "chore: initial project snapshot"
```

Do NOT `git add .` — that pulls in `.env`, `node_modules`, `.next`, `dist`. The named paths above are safe.

---

## Task 1: Add Prisma schema changes for HR foundation

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

This task only edits the schema file. Migration runs in Task 2.

- [ ] **Step 1: Add `terminatedAt` and `managerId` to `EmployeeProfile`**

Open `packages/db/prisma/schema.prisma`, locate `model EmployeeProfile` (~line 686), and replace the model body so the additions are clearly grouped:

```prisma
model EmployeeProfile {
  id               String           @id @default(cuid())
  userId           String           @unique
  user             User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  department       String
  designation      String
  salary           Decimal          @db.Decimal(12, 2)
  hourlyRate       Decimal?         @db.Decimal(10, 2)
  joinDate         DateTime         @db.Date
  employmentType   EmploymentType
  managerName      String?          // legacy free-text fallback
  managerId        String?
  manager          User?            @relation("EmployeeManager", fields: [managerId], references: [id], onDelete: SetNull)
  emergencyContact String?
  performanceScore Decimal?         @db.Decimal(4, 2)
  weeklyCapacityHrs Decimal         @default(40) @db.Decimal(5, 2)
  terminatedAt     DateTime?        @db.Date
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt
  documents        EmployeeDocument[]
  promotions       PromotionHistory[]
  salaryStructure  SalaryStructure?
  paySlips         PaySlip[]
  hrNotes          HrNote[]
  statusEvents     EmploymentStatusEvent[]
}
```

- [ ] **Step 2: Add the inverse relation on `User`**

Locate `model User` (~line 171). Find the existing list of relation fields (after `directReports` is what we add). Add this single line just below `employeeProfile EmployeeProfile?`:

```prisma
  directReports         EmployeeProfile[]        @relation("EmployeeManager")
  hrNotesAuthored       HrNote[]                 @relation("HrNoteAuthor")
  employmentEventsCreated EmploymentStatusEvent[] @relation("EmploymentEventCreator")
```

(All three are needed for the new models defined in Step 3.)

- [ ] **Step 3: Add the new models and enums at the end of the file**

Append to the bottom of `packages/db/prisma/schema.prisma`:

```prisma
// ── HR foundation additions ──

enum HrNoteCategory {
  KUDOS
  DISCIPLINARY
  ACCOMMODATION
  GENERAL
}

model HrNote {
  id          String          @id @default(cuid())
  employeeId  String
  employee    EmployeeProfile @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  authorId    String
  author      User            @relation("HrNoteAuthor", fields: [authorId], references: [id], onDelete: Restrict)
  category    HrNoteCategory  @default(GENERAL)
  body        String
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  @@index([employeeId, createdAt])
}

enum EmploymentEventType {
  HIRED
  PROMOTED
  TRANSFERRED
  SALARY_CHANGE
  TERMINATED
  REJOINED
}

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

  @@index([employeeId, effectiveDate])
}
```

- [ ] **Step 4: Verify the schema parses**

Run from project root:

```bash
cd /Users/nifal/Documents/nuro
npm run db:generate
```

Expected: succeeds with `✔ Generated Prisma Client (...)`. If it errors, the message will name a model/relation; fix the offending block and re-run.

- [ ] **Step 5: Commit**

```bash
cd /Users/nifal/Documents/nuro
git add packages/db/prisma/schema.prisma
git commit -m "feat(hr): add manager FK, terminatedAt, HrNote, EmploymentStatusEvent to schema"
```

---

## Task 2: Generate and apply the migration

**Files:**
- Create: `packages/db/prisma/migrations/<timestamp>_hr_foundation/migration.sql` (Prisma generates)

- [ ] **Step 1: Confirm Postgres is reachable**

```bash
cd /Users/nifal/Documents/nuro
docker compose ps 2>&1 | grep -E "postgres|db" || echo "no docker postgres running"
```

If no postgres is running, start it:

```bash
docker compose up -d postgres
```

Wait ~5 seconds for it to be ready.

- [ ] **Step 2: Run the migration**

```bash
cd /Users/nifal/Documents/nuro
npm run db:migrate -- --name hr_foundation
```

Expected output ends with `Your database is now in sync with your schema.`

If it complains about drift or pending migrations, ask before continuing — do NOT use `--force` or `migrate reset`.

- [ ] **Step 3: Verify the migration was created**

```bash
ls packages/db/prisma/migrations/ | tail -5
```

Expected: a new directory matching `*_hr_foundation`.

- [ ] **Step 4: Commit**

```bash
cd /Users/nifal/Documents/nuro
git add packages/db/prisma/migrations
git commit -m "feat(hr): add hr_foundation migration"
```

---

## Task 3: Update seed to include manager links and one HR note

**Files:**
- Modify: `packages/db/prisma/seed.ts`

- [ ] **Step 1: Read the existing seed**

```bash
sed -n '1,40p' /Users/nifal/Documents/nuro/packages/db/prisma/seed.ts
```

Note the existing pattern: how it gets a Prisma client, how it creates users / employees, how it ends. Follow that style.

- [ ] **Step 2: After the existing seed logic, set a manager link and add one HrNote**

Append the following block to `packages/db/prisma/seed.ts` just before the final `await prisma.$disconnect()` (or the script's end if no disconnect call exists). Match the existing import style for `prisma`:

```typescript
  // ── HR foundation seed enrichment ──
  const manager = await prisma.user.findFirst({
    where: { roles: { some: { role: { code: "PROJECT_MANAGER" } } } },
    select: { id: true },
  });
  const reportProfile = await prisma.employeeProfile.findFirst({
    where: { managerId: null, user: { id: { not: manager?.id } } },
    select: { id: true, userId: true },
  });
  if (manager && reportProfile) {
    await prisma.employeeProfile.update({
      where: { id: reportProfile.id },
      data: { managerId: manager.id },
    });
  }

  const hrAuthor = await prisma.user.findFirst({
    where: { roles: { some: { role: { code: "HR_MANAGER" } } } },
    select: { id: true },
  });
  if (hrAuthor && reportProfile) {
    await prisma.hrNote.create({
      data: {
        employeeId: reportProfile.id,
        authorId: hrAuthor.id,
        category: "GENERAL",
        body: "Initial HR note seeded for development testing.",
      },
    });
  }
```

- [ ] **Step 3: Re-run the seed**

```bash
cd /Users/nifal/Documents/nuro
npm run db:seed
```

Expected: completes without throwing. If a unique constraint complains because seed has already run, that's fine — the `findFirst` lookups make the new block idempotent at the row level (the `update` just re-sets the same FK; the `hrNote.create` will add a duplicate row, which is acceptable for dev seed). If you want strict idempotency, wrap the `hrNote.create` in a `findFirst({ where: { employeeId, body } })` guard.

- [ ] **Step 4: Commit**

```bash
cd /Users/nifal/Documents/nuro
git add packages/db/prisma/seed.ts
git commit -m "chore(seed): wire manager FK + sample HR note for foundation"
```

---

## Task 4: Create `HrPermissionsService` types and viewer-level helper

**Files:**
- Create: `apps/api/src/modules/hr/permissions/hr-permissions.types.ts`
- Create: `apps/api/src/modules/hr/permissions/hr-permissions.service.ts`

- [ ] **Step 1: Create the types file**

Create `apps/api/src/modules/hr/permissions/hr-permissions.types.ts`:

```typescript
import { RoleCode } from "@prisma/client";

export type ViewerLevel = "HR" | "FINANCE" | "PEER";

export type Relationship = "SELF" | "MANAGER" | "OTHER";

export interface ViewerContext {
  id: string;
  roleCodes: RoleCode[];
}

export type EmployeeTabKey =
  | "overview"
  | "attendance"
  | "leave"
  | "performance"
  | "payroll"
  | "career"
  | "projects"
  | "documents"
  | "assets"
  | "onboarding"
  | "timeline"
  | "notes";

export type EmployeeAction =
  | "VIEW"
  | "EDIT_PROFILE"
  | "EDIT_OWN_LIMITED"
  | "TERMINATE"
  | "RESEND_INVITE"
  | "LOG_CAREER_EVENT"
  | "ADD_HR_NOTE"
  | "DELETE_HR_NOTE"
  | "UPLOAD_DOCUMENT"
  | "DELETE_DOCUMENT"
  | "APPROVE_LEAVE"
  | "WRITE_REVIEW";
```

- [ ] **Step 2: Create the service skeleton with viewer-level helper**

Create `apps/api/src/modules/hr/permissions/hr-permissions.service.ts`:

```typescript
import { ForbiddenException, Injectable } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import {
  EmployeeAction,
  EmployeeTabKey,
  Relationship,
  ViewerContext,
  ViewerLevel,
} from "./hr-permissions.types";

const HR_ROLES: RoleCode[] = [RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER];
const FINANCE_ROLES: RoleCode[] = [RoleCode.FINANCE_MANAGER];

@Injectable()
export class HrPermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  viewerLevel(viewer: ViewerContext): ViewerLevel {
    if (viewer.roleCodes.some((r) => HR_ROLES.includes(r))) return "HR";
    if (viewer.roleCodes.some((r) => FINANCE_ROLES.includes(r))) return "FINANCE";
    return "PEER";
  }
}
```

- [ ] **Step 3: Verify it compiles**

```bash
cd /Users/nifal/Documents/nuro/apps/api
npx tsc --noEmit
```

Expected: no output (success). If you see "Cannot find module '@prisma/client'", run `npm run db:generate` from the project root and retry.

- [ ] **Step 4: Commit**

```bash
cd /Users/nifal/Documents/nuro
git add apps/api/src/modules/hr/permissions
git commit -m "feat(hr): scaffold HrPermissionsService with viewer-level helper"
```

---

## Task 5: Add relationship + tab + action methods to `HrPermissionsService`

**Files:**
- Modify: `apps/api/src/modules/hr/permissions/hr-permissions.service.ts`

- [ ] **Step 1: Add `relationshipTo` method**

Inside the `HrPermissionsService` class (after `viewerLevel`), add:

```typescript
  async relationshipTo(viewer: ViewerContext, targetUserId: string): Promise<Relationship> {
    if (viewer.id === targetUserId) return "SELF";

    // Direct manager via EmployeeProfile.managerId
    const directReport = await this.prisma.employeeProfile.findFirst({
      where: { userId: targetUserId, managerId: viewer.id },
      select: { id: true },
    });
    if (directReport) return "MANAGER";

    // Project manager: viewer manages a project the target is a member of
    if (viewer.roleCodes.includes(RoleCode.PROJECT_MANAGER)) {
      const sharedProject = await this.prisma.project.findFirst({
        where: {
          managerId: viewer.id,
          members: { some: { userId: targetUserId } },
        },
        select: { id: true },
      });
      if (sharedProject) return "MANAGER";
    }

    return "OTHER";
  }
```

- [ ] **Step 2: Add `canAccessTab`**

Inside the same class, after `relationshipTo`, add:

```typescript
  canAccessTab(level: ViewerLevel, relationship: Relationship, tab: EmployeeTabKey): boolean {
    // HR sees everything
    if (level === "HR") return true;

    // Finance: overview, payroll, career, timeline
    if (level === "FINANCE") {
      return tab === "overview" || tab === "payroll" || tab === "career" || tab === "timeline";
    }

    // Self: full access except payroll and notes
    if (relationship === "SELF") {
      return tab !== "payroll" && tab !== "notes";
    }

    // Manager (of this target): everything except payroll, documents, notes
    if (relationship === "MANAGER") {
      return tab !== "payroll" && tab !== "documents" && tab !== "notes";
    }

    // Peer: overview only (with field masking applied separately)
    return tab === "overview";
  }
```

- [ ] **Step 3: Add `assertCanWriteAction`**

Inside the same class, after `canAccessTab`, add:

```typescript
  assertCanWriteAction(
    level: ViewerLevel,
    relationship: Relationship,
    action: EmployeeAction,
  ): void {
    const allow = (() => {
      switch (action) {
        case "VIEW":
          return true;
        case "EDIT_PROFILE":
        case "TERMINATE":
        case "RESEND_INVITE":
        case "LOG_CAREER_EVENT":
        case "ADD_HR_NOTE":
        case "DELETE_HR_NOTE":
        case "UPLOAD_DOCUMENT":
        case "DELETE_DOCUMENT":
          return level === "HR";
        case "EDIT_OWN_LIMITED":
          return relationship === "SELF";
        case "APPROVE_LEAVE":
          return level === "HR" || relationship === "MANAGER";
        case "WRITE_REVIEW":
          return level === "HR" || relationship === "MANAGER";
        default:
          return false;
      }
    })();

    if (!allow) {
      throw new ForbiddenException(`Action ${action} not permitted`);
    }
  }
```

- [ ] **Step 4: Verify it compiles**

```bash
cd /Users/nifal/Documents/nuro/apps/api
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
cd /Users/nifal/Documents/nuro
git add apps/api/src/modules/hr/permissions/hr-permissions.service.ts
git commit -m "feat(hr): add relationship, tab access, and action gate methods"
```

---

## Task 6: Add field-masking helper to `HrPermissionsService`

**Files:**
- Modify: `apps/api/src/modules/hr/permissions/hr-permissions.service.ts`
- Modify: `apps/api/src/modules/hr/permissions/hr-permissions.types.ts`

- [ ] **Step 1: Add `EmployeeOverviewSource` and `MaskedOverviewDto` types**

Append to `apps/api/src/modules/hr/permissions/hr-permissions.types.ts`:

```typescript
export interface EmployeeOverviewSource {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatarUrl: string | null;
    phone: string | null;
    status: string;
    createdAt: Date;
  };
  profile: {
    id: string;
    department: string;
    designation: string;
    employmentType: string;
    joinDate: Date;
    salary: unknown;
    hourlyRate: unknown;
    managerId: string | null;
    managerName: string | null;
    emergencyContact: string | null;
    performanceScore: unknown;
    terminatedAt: Date | null;
  } | null;
  managerLabel: string | null;
}

export interface MaskedOverviewDto {
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
}
```

- [ ] **Step 2: Add `maskOverview` method**

Inside `HrPermissionsService` (after `assertCanWriteAction`), add:

```typescript
  maskOverview(
    level: ViewerLevel,
    relationship: Relationship,
    src: EmployeeOverviewSource,
  ): MaskedOverviewDto {
    const showSalary = level === "HR" || level === "FINANCE" || relationship === "SELF";
    const showSensitive = level === "HR" || relationship === "SELF";
    const showPerf = level === "HR" || relationship === "SELF" || relationship === "MANAGER";
    const showTerm = level === "HR" || relationship === "SELF" || relationship === "MANAGER";

    const num = (v: unknown): number | null =>
      v == null ? null : typeof v === "number" ? v : Number(v);

    return {
      userId: src.user.id,
      firstName: src.user.firstName,
      lastName: src.user.lastName,
      email: src.user.email,
      avatarUrl: src.user.avatarUrl,
      phone: showSensitive ? src.user.phone : null,
      status: src.user.status,
      joinDate: src.profile?.joinDate ? src.profile.joinDate.toISOString() : null,
      department: src.profile?.department ?? null,
      designation: src.profile?.designation ?? null,
      employmentType: src.profile?.employmentType ?? null,
      salary: showSalary ? num(src.profile?.salary) : null,
      hourlyRate: showSalary ? num(src.profile?.hourlyRate) : null,
      manager: src.managerLabel,
      emergencyContact: showSensitive ? (src.profile?.emergencyContact ?? null) : null,
      performanceScore: showPerf ? num(src.profile?.performanceScore) : null,
      terminated: showTerm ? !!src.profile?.terminatedAt : false,
    };
  }
```

- [ ] **Step 3: Update imports at the top of the service**

Make sure the imports include the new types. The full import block should read:

```typescript
import { ForbiddenException, Injectable } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import {
  EmployeeAction,
  EmployeeOverviewSource,
  EmployeeTabKey,
  MaskedOverviewDto,
  Relationship,
  ViewerContext,
  ViewerLevel,
} from "./hr-permissions.types";
```

- [ ] **Step 4: Verify it compiles**

```bash
cd /Users/nifal/Documents/nuro/apps/api
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
cd /Users/nifal/Documents/nuro
git add apps/api/src/modules/hr/permissions/
git commit -m "feat(hr): add field-masking helper for employee overview"
```

---

## Task 7: Wire `HrPermissionsService` into `HrModule`

**Files:**
- Modify: `apps/api/src/modules/hr/hr.module.ts`

- [ ] **Step 1: Replace the file**

Replace the entire contents of `apps/api/src/modules/hr/hr.module.ts` with:

```typescript
import { Module } from "@nestjs/common";
import { HrController } from "./hr.controller";
import { HrService } from "./hr.service";
import { HrPermissionsService } from "./permissions/hr-permissions.service";

@Module({
  controllers: [HrController],
  providers: [HrService, HrPermissionsService],
  exports: [HrPermissionsService],
})
export class HrModule {}
```

- [ ] **Step 2: Verify the API still builds**

```bash
cd /Users/nifal/Documents/nuro/apps/api
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Boot the API to confirm DI works**

```bash
cd /Users/nifal/Documents/nuro
npm run dev:api
```

Wait until you see `Nest application successfully started`. If you see a "Cannot resolve dependencies of HrPermissionsService" error, recheck the imports in the service. Press Ctrl-C to stop.

- [ ] **Step 4: Commit**

```bash
cd /Users/nifal/Documents/nuro
git add apps/api/src/modules/hr/hr.module.ts
git commit -m "feat(hr): provide HrPermissionsService in HrModule"
```

---

## Task 8: Create `CreateEmployeeDto`

**Files:**
- Create: `apps/api/src/modules/hr/dto/create-employee.dto.ts`

- [ ] **Step 1: Create the DTO**

Create `apps/api/src/modules/hr/dto/create-employee.dto.ts`:

```typescript
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import { EmploymentType, RoleCode } from "@prisma/client";

export class CreateEmployeeDto {
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsString()
  @IsNotEmpty()
  department!: string;

  @IsString()
  @IsNotEmpty()
  designation!: string;

  @IsEnum(EmploymentType)
  employmentType!: EmploymentType;

  @IsDateString()
  joinDate!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  salary!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  hourlyRate?: number;

  @IsOptional()
  @IsString()
  managerId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsEnum(RoleCode, { each: true })
  roles!: RoleCode[];

  @IsOptional()
  @IsBoolean()
  sendOnboardingChecklist?: boolean;

  @IsOptional()
  @IsString()
  onboardingChecklistId?: string;
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/nifal/Documents/nuro/apps/api
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd /Users/nifal/Documents/nuro
git add apps/api/src/modules/hr/dto/create-employee.dto.ts
git commit -m "feat(hr): add CreateEmployeeDto"
```

---

## Task 9: Add `createEmployee` to `HrService`

**Files:**
- Modify: `apps/api/src/modules/hr/hr.service.ts`

- [ ] **Step 1: Import dependencies**

At the top of `apps/api/src/modules/hr/hr.service.ts`, replace the existing import block with:

```typescript
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { EmploymentEventType, LeaveStatus, Prisma, RoleCode, UserStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { MailService } from "../../common/mail/mail.service";
import { hashPassword } from "../auth/password.util";
import { CreateEmployeeDto } from "./dto/create-employee.dto";
import { UpdateEmployeeProfileDto } from "./dto/update-employee-profile.dto";
```

- [ ] **Step 2: Inject `MailService`**

Replace the existing constructor with:

```typescript
  private readonly logger = new Logger(HrService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}
```

- [ ] **Step 3: Add the `createEmployee` method**

Inside the `HrService` class, after the existing `updateProfile` method, add:

```typescript
  async createEmployee(dto: CreateEmployeeDto, actorId: string) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new BadRequestException("A user with this email already exists.");
    }

    const roles = await this.prisma.role.findMany({ where: { code: { in: dto.roles } } });
    if (roles.length !== dto.roles.length) {
      throw new BadRequestException("One or more roles are invalid.");
    }

    if (dto.managerId) {
      const manager = await this.prisma.user.findUnique({
        where: { id: dto.managerId },
        select: { id: true },
      });
      if (!manager) throw new BadRequestException("Manager user not found.");
    }

    const tempPassword = this.generateTempPassword();

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash: hashPassword(tempPassword),
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          status: UserStatus.INVITED,
          roles: {
            create: roles.map((r) => ({ roleId: r.id })),
          },
          employeeProfile: {
            create: {
              department: dto.department,
              designation: dto.designation,
              salary: new Prisma.Decimal(dto.salary),
              hourlyRate: dto.hourlyRate != null ? new Prisma.Decimal(dto.hourlyRate) : null,
              joinDate: new Date(dto.joinDate),
              employmentType: dto.employmentType,
              managerId: dto.managerId ?? null,
            },
          },
        },
        include: {
          employeeProfile: true,
          roles: { include: { role: true } },
        },
      });

      if (user.employeeProfile) {
        await tx.employmentStatusEvent.create({
          data: {
            employeeId: user.employeeProfile.id,
            type: EmploymentEventType.HIRED,
            toValue: dto.designation,
            effectiveDate: new Date(dto.joinDate),
            reason: "New hire",
            createdById: actorId,
          },
        });
      }

      if (dto.sendOnboardingChecklist && dto.onboardingChecklistId && user.employeeProfile) {
        const template = await tx.onboardingChecklist.findUnique({
          where: { id: dto.onboardingChecklistId },
          include: { items: true },
        });
        if (template) {
          await tx.onboardingChecklist.create({
            data: {
              title: `${template.title} — ${user.firstName} ${user.lastName}`,
              description: template.description,
              items: {
                create: template.items.map((item) => ({
                  title: item.title,
                  sortOrder: item.sortOrder,
                  assigneeId: user.id,
                })),
              },
            },
          });
        }
      }

      return user;
    });

    // Fire-and-forget invite email; treat failure as soft warning.
    void this.mail
      .sendTemplateEmail(result.email, "Welcome to Nuro7 — your account is ready", {
        name: `${result.firstName} ${result.lastName}`,
        tempPassword,
        portalUrl: `${process.env.APP_URL ?? "http://localhost:3000"}/login`,
      })
      .catch((err) => this.logger.warn(`Invite email failed: ${(err as Error).message}`));

    return { user: result, tempPassword };
  }

  private generateTempPassword(): string {
    const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < 12; i++) {
      out += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return out;
  }
```

- [ ] **Step 4: Verify it compiles**

```bash
cd /Users/nifal/Documents/nuro/apps/api
npx tsc --noEmit
```

Expected: no output. If you see "Cannot find module '../../common/mail/mail.service'" or similar, double-check the relative path; the file lives at `apps/api/src/common/mail/mail.service.ts`.

- [ ] **Step 5: Add `MailService` to `HrModule.providers`**

This codebase provides `MailService` per-module (see `auth.module.ts`, `clients.module.ts`, `tasks.module.ts`). Match that pattern. Replace `apps/api/src/modules/hr/hr.module.ts` with:

```typescript
import { Module } from "@nestjs/common";
import { MailService } from "../../common/mail/mail.service";
import { HrController } from "./hr.controller";
import { HrService } from "./hr.service";
import { HrPermissionsService } from "./permissions/hr-permissions.service";

@Module({
  controllers: [HrController],
  providers: [HrService, HrPermissionsService, MailService],
  exports: [HrPermissionsService],
})
export class HrModule {}
```

- [ ] **Step 6: Commit**

```bash
cd /Users/nifal/Documents/nuro
git add apps/api/src/modules/hr/hr.service.ts apps/api/src/modules/hr/hr.module.ts
git commit -m "feat(hr): add createEmployee with transactional user/profile/event creation"
```

---

## Task 10: Add `POST /hr/employees` controller route

**Files:**
- Modify: `apps/api/src/modules/hr/hr.controller.ts`

- [ ] **Step 1: Replace the controller file**

Replace the entire contents of `apps/api/src/modules/hr/hr.controller.ts` with:

```typescript
import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CreateEmployeeDto } from "./dto/create-employee.dto";
import { UpdateEmployeeProfileDto } from "./dto/update-employee-profile.dto";
import { HrService } from "./hr.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("hr")
export class HrController {
  constructor(private readonly hrService: HrService) {}

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER, RoleCode.FINANCE_MANAGER)
  @Get("overview")
  overview() {
    return this.hrService.overview();
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Post("employees")
  createEmployee(
    @Body() dto: CreateEmployeeDto,
    @CurrentUser() actor: { id: string },
  ) {
    return this.hrService.createEmployee(dto, actor.id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER, RoleCode.FINANCE_MANAGER)
  @Patch("employees/:userId")
  updateProfile(
    @Param("userId") userId: string,
    @Body() dto: UpdateEmployeeProfileDto,
    @CurrentUser() actor: { id: string; roles?: RoleCode[] },
  ) {
    return this.hrService.updateProfile(userId, dto, actor);
  }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/nifal/Documents/nuro/apps/api
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd /Users/nifal/Documents/nuro
git add apps/api/src/modules/hr/hr.controller.ts
git commit -m "feat(hr): add POST /hr/employees route"
```

---

## Task 11: Smoke-test the API endpoint via curl

**Files:** none

- [ ] **Step 1: Start the API in dev mode**

In one terminal:

```bash
cd /Users/nifal/Documents/nuro
npm run dev:api
```

Wait until `Nest application successfully started`.

- [ ] **Step 2: Get an HR-level JWT**

In a second terminal, log in as the seeded HR_MANAGER user. Find their email by running:

```bash
cd /Users/nifal/Documents/nuro
sed -n '1,200p' packages/db/prisma/seed.ts | grep -A1 -E "hr@|HR_MANAGER" | head -10
```

Use whatever email/password you find. Then:

```bash
curl -s -X POST http://localhost:3001/auth/login \
  -H "content-type: application/json" \
  -d '{"email":"<HR_EMAIL>","password":"<HR_PASSWORD>"}' \
  | tee /tmp/login.json
```

Expected: a JSON response containing `accessToken`. Extract it:

```bash
TOKEN=$(node -e 'console.log(JSON.parse(require("fs").readFileSync("/tmp/login.json","utf8")).accessToken)')
echo "${TOKEN:0:30}..."
```

If the API runs on a different port, check `apps/api/.env` for `PORT`.

- [ ] **Step 3: POST a new employee**

```bash
curl -s -X POST http://localhost:3001/hr/employees \
  -H "authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "firstName":"Jordan",
    "lastName":"Test",
    "email":"jordan.test+'$(date +%s)'@example.com",
    "department":"Engineering",
    "designation":"Software Engineer",
    "employmentType":"FULL_TIME",
    "joinDate":"2026-05-04",
    "salary":75000,
    "roles":["EMPLOYEE"]
  }' | python3 -m json.tool
```

Expected: a JSON response with `user.id`, `user.email`, `user.employeeProfile.department === "Engineering"`, `user.status === "INVITED"`, plus `tempPassword`.

- [ ] **Step 4: Verify in the database**

```bash
cd /Users/nifal/Documents/nuro
docker compose exec postgres psql -U postgres -d nuro7 -c \
  "SELECT u.email, u.status, ep.department, ep.designation, ese.type FROM \"User\" u JOIN \"EmployeeProfile\" ep ON ep.\"userId\"=u.id LEFT JOIN \"EmploymentStatusEvent\" ese ON ese.\"employeeId\"=ep.id WHERE u.email LIKE 'jordan.test%' ORDER BY u.\"createdAt\" DESC LIMIT 1;"
```

Expected: one row with `status=INVITED`, `department=Engineering`, `type=HIRED`.

(If your db user/db name differs, adjust the command. The defaults match `docker-compose.yml` and `apps/api/.env`.)

- [ ] **Step 5: Stop the API**

Ctrl-C in the API terminal. No commit needed for a smoke test.

---

## Task 12: Add `useCreateEmployee` mutation hook

**Files:**
- Modify: `apps/web/lib/api/mutations.ts`

- [ ] **Step 1: Read the existing `useUpdateEmployee` to confirm imports & toast helper signatures**

```bash
sed -n '1,30p' /Users/nifal/Documents/nuro/apps/web/lib/api/mutations.ts
```

Note the imports of `apiPost`, `apiPatch`, `useMutation`, `useQueryClient`, `toast`. Reuse them — do not re-import.

- [ ] **Step 2: Append `useCreateEmployee` immediately after `useUpdateEmployee`**

In `apps/web/lib/api/mutations.ts`, after the existing `useUpdateEmployee` function (~line 237), add:

```typescript
export interface CreateEmployeeInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  department: string;
  designation: string;
  employmentType: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERN";
  joinDate: string;
  salary: number;
  hourlyRate?: number;
  managerId?: string;
  roles: string[];
  sendOnboardingChecklist?: boolean;
  onboardingChecklistId?: string;
}

export function useCreateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateEmployeeInput) =>
      apiPost<{ user: { id: string }; tempPassword: string }>("/hr/employees", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["hr-overview"] });
      toast({ variant: "success", title: "Employee added" });
    },
    onError: (err: Error) =>
      toast({ variant: "error", title: "Failed to add employee", description: err?.message }),
  });
}
```

- [ ] **Step 3: Verify the web app compiles**

```bash
cd /Users/nifal/Documents/nuro/apps/web
npx tsc --noEmit
```

Expected: no output. If `apiPost`'s generic signature differs (e.g. it doesn't accept a type parameter), drop the `<...>` and remove the success-payload typing.

- [ ] **Step 4: Commit**

```bash
cd /Users/nifal/Documents/nuro
git add apps/web/lib/api/mutations.ts
git commit -m "feat(hr): add useCreateEmployee mutation hook"
```

---

## Task 13: Build the `<AddEmployeeDialog>` component

**Files:**
- Create: `apps/web/components/hr/add-employee-dialog.tsx`

- [ ] **Step 1: Create the dialog file**

Create `apps/web/components/hr/add-employee-dialog.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useCreateEmployee, type CreateEmployeeInput } from "@/lib/api/mutations";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const EMPLOYMENT_TYPES: CreateEmployeeInput["employmentType"][] = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "INTERN",
];

const ROLE_OPTIONS = [
  { value: "EMPLOYEE", label: "Employee" },
  { value: "PROJECT_MANAGER", label: "Project Manager" },
  { value: "HR_MANAGER", label: "HR Manager" },
  { value: "FINANCE_MANAGER", label: "Finance Manager" },
  { value: "ADMIN", label: "Admin" },
];

const todayIso = () => new Date().toISOString().slice(0, 10);

export function AddEmployeeDialog({ open, onOpenChange }: Props) {
  const router = useRouter();
  const mutation = useCreateEmployee();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [department, setDepartment] = useState("");
  const [designation, setDesignation] = useState("");
  const [employmentType, setEmploymentType] =
    useState<CreateEmployeeInput["employmentType"]>("FULL_TIME");
  const [joinDate, setJoinDate] = useState(todayIso());
  const [salary, setSalary] = useState<number | null>(null);
  const [hourlyRate, setHourlyRate] = useState<number | null>(null);
  const [primaryRole, setPrimaryRole] = useState<string>("EMPLOYEE");

  const reset = () => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setDepartment("");
    setDesignation("");
    setEmploymentType("FULL_TIME");
    setJoinDate(todayIso());
    setSalary(null);
    setHourlyRate(null);
    setPrimaryRole("EMPLOYEE");
  };

  const submit = () => {
    if (!firstName || !lastName || !email || !department || !designation || salary == null) {
      return;
    }
    const payload: CreateEmployeeInput = {
      firstName,
      lastName,
      email,
      phone: phone || undefined,
      department,
      designation,
      employmentType,
      joinDate,
      salary,
      hourlyRate: hourlyRate ?? undefined,
      roles: [primaryRole],
    };
    mutation.mutate(payload, {
      onSuccess: (res) => {
        reset();
        onOpenChange(false);
        if (res?.user?.id) {
          // Detail page route ships in Plan 2; for now we just refresh the directory.
          router.refresh();
        }
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Add employee</DialogTitle>
          <DialogDescription>
            Create the user account and HR profile in one step. An invite is sent to the email.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="First name">
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </Field>
            <Field label="Last name">
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </Field>
          </div>

          <Field label="Work email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Phone (optional)">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Department">
              <Input value={department} onChange={(e) => setDepartment(e.target.value)} />
            </Field>
            <Field label="Designation">
              <Input value={designation} onChange={(e) => setDesignation(e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Employment type">
              <Select
                value={employmentType}
                onValueChange={(v) =>
                  setEmploymentType(v as CreateEmployeeInput["employmentType"])
                }
                options={EMPLOYMENT_TYPES.map((t) => ({ value: t, label: t.replace("_", " ") }))}
              />
            </Field>
            <Field label="Join date">
              <Input type="date" value={joinDate} onChange={(e) => setJoinDate(e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Salary (annual)">
              <NumberInput value={salary} onChange={setSalary} placeholder="0" />
            </Field>
            <Field label="Hourly rate (optional)">
              <NumberInput value={hourlyRate} onChange={setHourlyRate} placeholder="0.00" suffix="/hr" />
            </Field>
          </div>

          <Field label="Primary role">
            <Select value={primaryRole} onValueChange={setPrimaryRole} options={ROLE_OPTIONS} />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? "Adding..." : "Add employee"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-500">{label}</label>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/nifal/Documents/nuro/apps/web
npx tsc --noEmit
```

Expected: no output. If `Select`'s `onValueChange` signature is different in this codebase, adjust the type cast on `setEmploymentType`.

- [ ] **Step 3: Commit**

```bash
cd /Users/nifal/Documents/nuro
git add apps/web/components/hr/add-employee-dialog.tsx
git commit -m "feat(hr): add AddEmployeeDialog component"
```

---

## Task 14: Wire the "+ Add Employee" button into `/hr` page

**Files:**
- Modify: `apps/web/app/(dashboard)/hr/page.tsx`

- [ ] **Step 1: Update imports**

In `apps/web/app/(dashboard)/hr/page.tsx`, add the dialog import alongside the existing `EmployeeEditDialog` import. Replace the existing import line:

```typescript
import { EmployeeEditDialog, type EmployeeEditTarget } from "@/components/hr/employee-edit-dialog";
```

with:

```typescript
import { EmployeeEditDialog, type EmployeeEditTarget } from "@/components/hr/employee-edit-dialog";
import { AddEmployeeDialog } from "@/components/hr/add-employee-dialog";
```

- [ ] **Step 2: Add the open-state for the new dialog**

Inside `HrPage()`, after the existing `editTarget` state declaration (~line 25), add:

```typescript
  const [addOpen, setAddOpen] = useState(false);
```

- [ ] **Step 3: Render an "Add employee" button in the page header**

Locate the `<ModuleHeader>` invocation in the JSX. Below it, before the `<section className="grid gap-4 md:grid-cols-3">` block, add:

```typescript
      {(roles.includes("HR_MANAGER") || roles.includes("ADMIN") || roles.includes("SUPER_ADMIN")) && (
        <div className="flex justify-end">
          <Button onClick={() => setAddOpen(true)}>+ Add employee</Button>
        </div>
      )}
```

`Button` is already imported in this file. `roles` is already in scope. No new imports needed.

- [ ] **Step 4: Render the dialog at the end of the return**

Locate the existing `<EmployeeEditDialog ... />` at the bottom of the return. Add the `<AddEmployeeDialog>` immediately after it:

```typescript
      <EmployeeEditDialog
        open={!!editTarget}
        onOpenChange={(v) => !v && setEditTarget(null)}
        employee={editTarget}
      />

      <AddEmployeeDialog open={addOpen} onOpenChange={setAddOpen} />
```

- [ ] **Step 5: Verify the web app compiles**

```bash
cd /Users/nifal/Documents/nuro/apps/web
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 6: Run the linter on touched workspaces**

```bash
cd /Users/nifal/Documents/nuro
npm run lint --workspace @nuro7/web --if-present
npm run lint --workspace @nuro7/api --if-present
```

Expected: no errors. Warnings are acceptable but flag any new ones you introduced.

- [ ] **Step 7: Commit**

```bash
cd /Users/nifal/Documents/nuro
git add apps/web/app/\(dashboard\)/hr/page.tsx
git commit -m "feat(hr): wire + Add employee button into HR page"
```

---

## Task 15: Browser smoke test

**Files:** none

- [ ] **Step 1: Start API and web in two terminals**

Terminal A:
```bash
cd /Users/nifal/Documents/nuro
npm run dev:api
```

Terminal B (after API logs `Nest application successfully started`):
```bash
cd /Users/nifal/Documents/nuro
npm run dev:web
```

- [ ] **Step 2: Log in as HR**

Open `http://localhost:3000/login`, log in with the HR_MANAGER seed credentials. Navigate to `/hr`.

- [ ] **Step 3: Verify the "+ Add employee" button is visible**

Expected: a button at the top-right of the HR page (just below the module header). If it isn't visible, check: are you logged in as an HR-level user? Does `useAuthStore.getState().user.roles` include `HR_MANAGER`?

- [ ] **Step 4: Add a new employee through the dialog**

Click "+ Add employee". Fill in:
- First name: `Pat`
- Last name: `Sample`
- Email: `pat.sample+<unique>@example.com`
- Department: `Design`
- Designation: `Senior Designer`
- Employment type: `FULL_TIME`
- Join date: today
- Salary: `90000`
- Primary role: `Employee`

Click "Add employee". Expected: a green success toast, the dialog closes.

- [ ] **Step 5: Verify the new employee appears in the directory**

Wait ~1 second for `useHrOverview` to refetch (the mutation invalidates the `hr-overview` query). The new employee card should appear in the Employee Directory section. If it doesn't, hard-reload (Cmd-Shift-R) — the invalidation may not have fired.

- [ ] **Step 6: Verify the invite email was logged**

In the API terminal, you should see a log line like:
```
Email queued to pat.sample+...@example.com: Welcome to Nuro7 — your account is ready ...
```

(This codebase's `MailService` only logs; real send is a follow-up.)

- [ ] **Step 7: Negative test — duplicate email**

Click "+ Add employee" again, submit with the same email. Expected: an error toast with the message "A user with this email already exists." (HTTP 400).

- [ ] **Step 8: Negative test — non-HR user**

Log out, log in as a non-HR user (any seeded employee). Navigate to `/hr` (if they have access). Expected: the "+ Add employee" button does NOT render.

If `/hr` itself is blocked for them (no overview access), that's also fine — Phase 1 doesn't change route gating.

- [ ] **Step 9: Stop both dev servers**

Ctrl-C in both terminals. No commit for the smoke test itself.

---

## Task 16: Final cleanup commit

**Files:** none new — review only.

- [ ] **Step 1: Confirm everything is committed**

```bash
cd /Users/nifal/Documents/nuro
git status
```

Expected: `nothing to commit, working tree clean`.

If there are stray uncommitted changes (e.g. `tsconfig.tsbuildinfo`, `.next`, `dist` artefacts), confirm they're in `.gitignore`. If they aren't, add them now:

```bash
echo "
# Build artefacts
**/.next
**/dist
**/tsconfig.tsbuildinfo
**/node_modules
" >> .gitignore
git add .gitignore
git commit -m "chore(gitignore): exclude build artefacts"
```

- [ ] **Step 2: Skim the diff one last time**

```bash
cd /Users/nifal/Documents/nuro
git log --oneline -20
```

Expected: a clean, sequential history of the tasks above. If any commit message is unclear or any commit groups unrelated changes, leave a note for the reviewer in your handoff message — do not rewrite history.

---

## What's done at the end of this plan

✅ Schema upgraded with `managerId`, `terminatedAt`, `HrNote`, `EmploymentStatusEvent`.
✅ Migration applied, seed extended.
✅ `HrPermissionsService` provides viewer-level, relationship, tab-access, action-gate, and field-masking helpers — ready to be reused by every endpoint in Plan 2 (Employee 360°) and Plan 3 (Hub).
✅ HR users can add a new employee end-to-end through the UI; transactional creation logs a `HIRED` event; invite is dispatched to mail service.
✅ Frontend wires the new dialog into the existing `/hr` page without touching unrelated logic.

## What's NOT in this plan (intentional)

- The Employee 360° detail page (Plan 2).
- The HR Operations Hub rebuild, org chart, directory page, terminate flow (Plan 3).
- Test framework setup (no Jest/Vitest in the project today; verification is via type-check + lint + manual smoke). Adding test infrastructure is its own task and was scoped out by the user during brainstorming.
- CSV bulk import (out of scope — single-step form chosen).
- Onboarding checklist template UI; the API already supports it (`sendOnboardingChecklist` + `onboardingChecklistId`), but the dialog doesn't expose a picker yet. Add when the Onboarding tab lands in Plan 2.
