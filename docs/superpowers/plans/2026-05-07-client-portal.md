# Client Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a v1 client portal where clients self-serve project status, tasks, invoices, proposals, and support requests.

**Architecture:** Magic-link auth with a separate `ClientContact` table and dedicated `ClientPortalGuard`; staff JWT path is left untouched. Portal API at `/api/v1/client-portal/*`, portal UI in a new Next.js `(portal)` route group at `/portal/*`. Every query joins through `req.portal.clientId`. Whitelist serializers prevent internal-field leaks.

**Tech Stack:** NestJS 11, Prisma 6, Next.js 15, shadcn/ui, Postgres, `@nestjs/throttler`, Jest (new).

**Spec:** `docs/superpowers/specs/2026-05-07-client-portal-design.md`

---

## Phase 0 — Prep

### Task 0.1: Create feature branch and verify clean tree

**Files:** none (workspace-level)

- [ ] **Step 1: Verify working tree status**

Run: `git status -s`
Expected: lines for the in-flight uncommitted changes already in the repo (acceptable — we leave them alone).

- [ ] **Step 2: Create branch**

Run:
```bash
git checkout -b feat/client-portal
```
Expected: `Switched to a new branch 'feat/client-portal'`

- [ ] **Step 3: Confirm baseline builds**

Run:
```bash
npm run build --workspace @nuro7/api && npm run build --workspace @nuro7/web
```
Expected: both complete with no errors.

---

## Phase 1 — Database schema

### Task 1.1: Add new Prisma enums and models

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (append at the end of the file)
- Modify: `packages/db/prisma/schema.prisma` (existing `Task`, `Client`, `Project`, `Proposal`, `User` models — add back-relations and `Task.isClientVisible`)

- [ ] **Step 1: Append new enums and models**

Append to the end of `packages/db/prisma/schema.prisma`:

```prisma
enum ClientContactStatus {
  ACTIVE
  DISABLED
}

enum ClientRequestStatus {
  OPEN
  IN_PROGRESS
  RESOLVED
  CLOSED
}

enum AcceptanceDecision {
  ACCEPTED
  REJECTED
}

model ClientContact {
  id        String              @id @default(cuid())
  clientId  String
  client    Client              @relation(fields: [clientId], references: [id], onDelete: Cascade)
  email     String
  name      String?
  status    ClientContactStatus @default(ACTIVE)
  createdAt DateTime            @default(now())
  updatedAt DateTime            @updatedAt

  magicLinks          ClientMagicLink[]
  sessions            ClientPortalSession[]
  requests            ClientRequest[]
  messages            ClientRequestMessage[]
  proposalAcceptances ProposalAcceptance[]

  @@unique([clientId, email])
  @@index([email])
}

model ClientMagicLink {
  id        String        @id @default(cuid())
  contactId String
  contact   ClientContact @relation(fields: [contactId], references: [id], onDelete: Cascade)
  tokenHash String        @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime      @default(now())
  ip        String?

  @@index([contactId])
}

model ClientPortalSession {
  id         String        @id @default(cuid())
  contactId  String
  contact    ClientContact @relation(fields: [contactId], references: [id], onDelete: Cascade)
  tokenHash  String        @unique
  expiresAt  DateTime
  revokedAt  DateTime?
  lastSeenAt DateTime      @default(now())
  userAgent  String?
  ip         String?

  @@index([contactId])
}

model ClientRequest {
  id           String              @id @default(cuid())
  clientId     String
  client       Client              @relation(fields: [clientId], references: [id])
  projectId    String?
  project      Project?            @relation(fields: [projectId], references: [id])
  createdById  String
  createdBy    ClientContact       @relation(fields: [createdById], references: [id])
  title        String
  body         String
  status       ClientRequestStatus @default(OPEN)
  linkedTaskId String?
  linkedTask   Task?               @relation(fields: [linkedTaskId], references: [id])
  createdAt    DateTime            @default(now())
  updatedAt    DateTime            @updatedAt
  messages     ClientRequestMessage[]

  @@index([clientId, status])
}

model ClientRequestMessage {
  id              String         @id @default(cuid())
  requestId       String
  request         ClientRequest  @relation(fields: [requestId], references: [id], onDelete: Cascade)
  authorContactId String?
  authorContact   ClientContact? @relation(fields: [authorContactId], references: [id])
  authorUserId    String?
  authorUser      User?          @relation(fields: [authorUserId], references: [id])
  body            String
  createdAt       DateTime       @default(now())

  @@index([requestId, createdAt])
}

model ProposalAcceptance {
  id         String             @id @default(cuid())
  proposalId String             @unique
  proposal   Proposal           @relation(fields: [proposalId], references: [id])
  contactId  String
  contact    ClientContact      @relation(fields: [contactId], references: [id])
  decision   AcceptanceDecision
  note       String?
  ip         String
  userAgent  String
  decidedAt  DateTime           @default(now())
}
```

- [ ] **Step 2: Add `isClientVisible` to `Task`**

Locate `model Task {` in `schema.prisma`. Inside it (just below the existing `status` field), add:

```prisma
  isClientVisible Boolean @default(false)
```

And inside the same `model Task` block, add a back-relation:

```prisma
  clientRequests ClientRequest[]
```

- [ ] **Step 3: Add back-relations to existing models**

In `model Client { ... }` add:
```prisma
  contacts        ClientContact[]
  clientRequests  ClientRequest[]
```

In `model Project { ... }` add:
```prisma
  clientRequests  ClientRequest[]
```

In `model Proposal { ... }` add:
```prisma
  acceptance ProposalAcceptance?
```

In `model User { ... }` add:
```prisma
  clientRequestMessages ClientRequestMessage[]
```

- [ ] **Step 4: Generate Prisma client to validate the schema**

Run:
```bash
npm run db:generate
```
Expected: `✔ Generated Prisma Client` (no schema errors).

- [ ] **Step 5: Create migration**

Ensure Postgres is running (`docker-compose up -d db`). Then:
```bash
npx prisma migrate dev --schema packages/db/prisma/schema.prisma --name client_portal
```
Expected: a new migration directory under `packages/db/prisma/migrations/` and the message `Your database is now in sync`.

- [ ] **Step 6: Add author-XOR check constraint**

Open the freshly created migration's `migration.sql` and append:

```sql
ALTER TABLE "ClientRequestMessage"
  ADD CONSTRAINT "client_request_message_author_xor"
  CHECK (
    (CASE WHEN "authorContactId" IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN "authorUserId" IS NOT NULL THEN 1 ELSE 0 END) = 1
  );
```

Re-apply:
```bash
npx prisma migrate dev --schema packages/db/prisma/schema.prisma
```
Expected: migration applied (no errors).

- [ ] **Step 7: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations
git commit -m "feat(db): client portal models (contacts, sessions, requests, acceptances)"
```

---

## Phase 2 — Portal auth (magic link + guard)

### Task 2.1: Scaffold `client-portal` module skeleton

**Files:**
- Create: `apps/api/src/modules/client-portal/client-portal.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Create empty module**

Create `apps/api/src/modules/client-portal/client-portal.module.ts`:

```typescript
import { Module } from "@nestjs/common";

@Module({
  imports: [],
  controllers: [],
  providers: [],
  exports: [],
})
export class ClientPortalModule {}
```

- [ ] **Step 2: Register in app module**

In `apps/api/src/app.module.ts`, add the import alongside the other module imports:

```typescript
import { ClientPortalModule } from "./modules/client-portal/client-portal.module";
```

And add `ClientPortalModule` to the `imports: [...]` array (anywhere in the list).

- [ ] **Step 3: Verify build**

Run: `npm run build --workspace @nuro7/api`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/client-portal apps/api/src/app.module.ts
git commit -m "feat(api): scaffold client-portal module"
```

### Task 2.2: Token utility (32-byte base64url + sha256)

**Files:**
- Create: `apps/api/src/modules/client-portal/token.util.ts`

- [ ] **Step 1: Implement**

```typescript
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

export function generateToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  const hash = sha256(raw);
  return { raw, hash };
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/client-portal/token.util.ts
git commit -m "feat(api): client-portal token util"
```

### Task 2.3: Portal env vars

**Files:**
- Modify: `apps/api/src/config/env.ts`

- [ ] **Step 1: Read existing file**

Open `apps/api/src/config/env.ts` to see the existing env shape.

- [ ] **Step 2: Add portal vars**

Add to the env object (alongside existing keys):

```typescript
portalEnabled: process.env.PORTAL_ENABLED === "true",
portalUrl: process.env.PORTAL_URL ?? "http://localhost:3000",
portalSessionTtlDays: Number(process.env.PORTAL_SESSION_TTL_DAYS ?? 30),
portalMagicLinkTtlMinutes: Number(process.env.PORTAL_MAGIC_LINK_TTL_MINUTES ?? 15),
```

If the file uses a Zod schema, mirror these into the schema with sensible defaults.

- [ ] **Step 3: Verify build**

Run: `npm run build --workspace @nuro7/api`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/config/env.ts
git commit -m "feat(api): portal env vars"
```

### Task 2.4: `ClientPortalGuard`

**Files:**
- Create: `apps/api/src/modules/client-portal/client-portal.guard.ts`
- Create: `apps/api/src/modules/client-portal/portal-context.decorator.ts`

- [ ] **Step 1: Create guard**

```typescript
// apps/api/src/modules/client-portal/client-portal.guard.ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { sha256 } from "./token.util";

export const PORTAL_COOKIE = "cp_session";

@Injectable()
export class ClientPortalGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const raw = req.cookies?.[PORTAL_COOKIE];
    if (!raw) throw new UnauthorizedException("unauthenticated");

    const tokenHash = sha256(raw);
    const session = await this.prisma.clientPortalSession.findUnique({
      where: { tokenHash },
      include: { contact: true },
    });
    if (!session) throw new UnauthorizedException("unauthenticated");
    if (session.revokedAt) throw new UnauthorizedException("unauthenticated");
    if (session.expiresAt < new Date()) throw new UnauthorizedException("unauthenticated");
    if (session.contact.status !== "ACTIVE") throw new UnauthorizedException("unauthenticated");

    // Slide expiry by 30 days from now; update lastSeenAt.
    const ttlDays = 30;
    const newExpires = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
    await this.prisma.clientPortalSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date(), expiresAt: newExpires },
    });

    req.portal = { contactId: session.contactId, clientId: session.contact.clientId };
    return true;
  }
}
```

- [ ] **Step 2: Create context decorator**

```typescript
// apps/api/src/modules/client-portal/portal-context.decorator.ts
import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export type PortalContext = { contactId: string; clientId: string };

export const Portal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PortalContext => {
    const req = ctx.switchToHttp().getRequest();
    return req.portal;
  },
);
```

- [ ] **Step 3: Install cookie-parser if missing**

Check `apps/api/package.json` for `cookie-parser`. If missing:
```bash
npm install --workspace @nuro7/api cookie-parser
npm install --workspace @nuro7/api -D @types/cookie-parser
```

- [ ] **Step 4: Wire cookie-parser**

In `apps/api/src/main.ts`, after `const app = await NestFactory.create(...)`:

```typescript
import cookieParser from "cookie-parser";
// ...
app.use(cookieParser());
```

- [ ] **Step 5: Verify build**

Run: `npm run build --workspace @nuro7/api`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/client-portal apps/api/src/main.ts apps/api/package.json package-lock.json
git commit -m "feat(api): ClientPortalGuard + cookie parsing"
```

### Task 2.5: Auth service — magic link issue + verify

**Files:**
- Create: `apps/api/src/modules/client-portal/auth/portal-auth.service.ts`
- Create: `apps/api/src/modules/client-portal/auth/dto.ts`

- [ ] **Step 1: DTOs**

```typescript
// apps/api/src/modules/client-portal/auth/dto.ts
import { IsEmail } from "class-validator";

export class RequestLinkDto {
  @IsEmail()
  email!: string;
}
```

- [ ] **Step 2: Service**

```typescript
// apps/api/src/modules/client-portal/auth/portal-auth.service.ts
import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { MailService } from "../../../common/mail/mail.service";
import { env } from "../../../config/env";
import { generateToken, sha256 } from "../token.util";

@Injectable()
export class PortalAuthService {
  private readonly logger = new Logger(PortalAuthService.name);

  constructor(private readonly prisma: PrismaService, private readonly mail: MailService) {}

  async requestLink(email: string, ip: string | null): Promise<void> {
    const contact = await this.prisma.clientContact.findFirst({
      where: { email: email.toLowerCase(), status: "ACTIVE" },
    });
    if (!contact) {
      // do not leak existence
      return;
    }

    const { raw, hash } = generateToken();
    const expiresAt = new Date(Date.now() + env.portalMagicLinkTtlMinutes * 60 * 1000);
    await this.prisma.clientMagicLink.create({
      data: { contactId: contact.id, tokenHash: hash, expiresAt, ip },
    });

    const link = `${env.portalUrl}/portal/auth/verify?token=${raw}`;
    await this.mail.sendTemplateEmail(contact.email, "Sign in to your portal", {
      name: contact.name ?? "there",
      link,
      ttlMinutes: String(env.portalMagicLinkTtlMinutes),
    });
  }

  async verify(rawToken: string, ip: string | null, ua: string | null): Promise<{ sessionRaw: string; expiresAt: Date }> {
    const hash = sha256(rawToken);
    const link = await this.prisma.clientMagicLink.findUnique({ where: { tokenHash: hash } });
    if (!link) throw new Error("invalid");
    if (link.usedAt) throw new Error("invalid");
    if (link.expiresAt < new Date()) throw new Error("invalid");

    await this.prisma.clientMagicLink.update({ where: { id: link.id }, data: { usedAt: new Date() } });

    const session = generateToken();
    const expiresAt = new Date(Date.now() + env.portalSessionTtlDays * 24 * 60 * 60 * 1000);
    await this.prisma.clientPortalSession.create({
      data: { contactId: link.contactId, tokenHash: session.hash, expiresAt, ip, userAgent: ua },
    });

    return { sessionRaw: session.raw, expiresAt };
  }

  async revoke(rawSession: string): Promise<void> {
    const hash = sha256(rawSession);
    await this.prisma.clientPortalSession.updateMany({
      where: { tokenHash: hash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/client-portal/auth
git commit -m "feat(api): portal magic-link service"
```

### Task 2.6: Auth controller + throttling

**Files:**
- Create: `apps/api/src/modules/client-portal/auth/portal-auth.controller.ts`

- [ ] **Step 1: Implement controller**

```typescript
// apps/api/src/modules/client-portal/auth/portal-auth.controller.ts
import { Body, Controller, Get, Post, Query, Req, Res, UseGuards, HttpCode } from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { env } from "../../../config/env";
import { PORTAL_COOKIE, ClientPortalGuard } from "../client-portal.guard";
import { RequestLinkDto } from "./dto";
import { PortalAuthService } from "./portal-auth.service";

@Controller("client-portal/auth")
@UseGuards(ThrottlerGuard)
export class PortalAuthController {
  constructor(private readonly auth: PortalAuthService) {}

  @Post("request-link")
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } })
  async requestLink(@Body() dto: RequestLinkDto, @Req() req: Request) {
    await this.auth.requestLink(dto.email.toLowerCase(), req.ip ?? null);
    return { ok: true };
  }

  @Get("verify")
  async verify(@Query("token") token: string, @Req() req: Request, @Res() res: Response) {
    if (!token) return res.redirect(`${env.portalUrl}/portal/login?e=invalid`);
    try {
      const { sessionRaw, expiresAt } = await this.auth.verify(
        token,
        req.ip ?? null,
        req.headers["user-agent"] ?? null,
      );
      res.cookie(PORTAL_COOKIE, sessionRaw, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        expires: expiresAt,
      });
      return res.redirect(`${env.portalUrl}/portal`);
    } catch {
      return res.redirect(`${env.portalUrl}/portal/login?e=invalid`);
    }
  }

  @Post("logout")
  @UseGuards(ClientPortalGuard)
  @HttpCode(200)
  async logout(@Req() req: Request, @Res() res: Response) {
    const raw = req.cookies?.[PORTAL_COOKIE];
    if (raw) await this.auth.revoke(raw);
    res.clearCookie(PORTAL_COOKIE, { path: "/" });
    return res.json({ ok: true });
  }
}
```

- [ ] **Step 2: Wire into module**

Update `apps/api/src/modules/client-portal/client-portal.module.ts`:

```typescript
import { Module } from "@nestjs/common";
import { MailService } from "../../common/mail/mail.service";
import { ClientPortalGuard } from "./client-portal.guard";
import { PortalAuthController } from "./auth/portal-auth.controller";
import { PortalAuthService } from "./auth/portal-auth.service";

@Module({
  controllers: [PortalAuthController],
  providers: [ClientPortalGuard, PortalAuthService, MailService],
  exports: [ClientPortalGuard],
})
export class ClientPortalModule {}
```

- [ ] **Step 3: Manual smoke test**

Start API (`npm run dev:api`), then:
```bash
curl -i -X POST http://localhost:4000/api/v1/client-portal/auth/request-link \
  -H 'content-type: application/json' \
  -d '{"email":"nobody@example.com"}'
```
Expected: `HTTP/1.1 200 OK` with `{"ok":true}` (no enumeration even though contact does not exist).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/client-portal
git commit -m "feat(api): portal magic-link auth endpoints"
```

---

## Phase 3 — Portal API: read endpoints

### Task 3.1: Whitelist serializers

**Files:**
- Create: `apps/api/src/modules/client-portal/serializers.ts`

- [ ] **Step 1: Implement**

```typescript
// apps/api/src/modules/client-portal/serializers.ts

export function serializeProject(p: any) {
  return {
    id: p.id,
    name: p.name,
    status: p.status,
    startDate: p.startDate ?? null,
    dueDate: p.dueDate ?? null,
    percentComplete: p.percentComplete ?? null,
  };
}

export function serializeMilestone(m: any) {
  return { id: m.id, title: m.title, dueDate: m.dueDate ?? null, status: m.status };
}

export function serializeTask(t: any) {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    dueDate: t.dueDate ?? null,
    priority: t.priority ?? null,
  };
}

export function serializeInvoice(i: any) {
  return {
    id: i.id,
    number: i.number,
    issueDate: i.issueDate,
    dueDate: i.dueDate,
    total: i.total,
    status: i.status,
    currency: i.currency,
  };
}

export function serializeProposal(p: any) {
  return {
    id: p.id,
    title: p.title,
    sentAt: p.sentAt ?? null,
    status: p.status,
    total: p.total ?? null,
    currency: p.currency ?? null,
  };
}

export function serializeRequest(r: any) {
  return {
    id: r.id,
    title: r.title,
    status: r.status,
    projectId: r.projectId ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function serializeRequestMessage(m: any) {
  return {
    id: m.id,
    body: m.body,
    createdAt: m.createdAt,
    author: m.authorContactId
      ? { kind: "contact", id: m.authorContactId, name: m.authorContact?.name ?? null }
      : { kind: "staff", id: m.authorUserId, name: m.authorUser?.name ?? null },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/client-portal/serializers.ts
git commit -m "feat(api): portal whitelist serializers"
```

### Task 3.2: Projects + tasks endpoints

**Files:**
- Create: `apps/api/src/modules/client-portal/projects/portal-projects.controller.ts`
- Create: `apps/api/src/modules/client-portal/projects/portal-projects.service.ts`
- Modify: `apps/api/src/modules/client-portal/client-portal.module.ts`

- [ ] **Step 1: Service**

```typescript
// apps/api/src/modules/client-portal/projects/portal-projects.service.ts
import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { serializeMilestone, serializeProject, serializeTask } from "../serializers";

@Injectable()
export class PortalProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(clientId: string) {
    const rows = await this.prisma.project.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(serializeProject);
  }

  async detail(clientId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, clientId },
      include: { milestones: { orderBy: { dueDate: "asc" } } },
    });
    if (!project) throw new NotFoundException();
    return {
      ...serializeProject(project),
      milestones: project.milestones.map(serializeMilestone),
    };
  }

  async tasks(clientId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, clientId } });
    if (!project) throw new NotFoundException();
    const tasks = await this.prisma.task.findMany({
      where: { projectId, isClientVisible: true },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    });
    return tasks.map(serializeTask);
  }
}
```

- [ ] **Step 2: Controller**

```typescript
// apps/api/src/modules/client-portal/projects/portal-projects.controller.ts
import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { ClientPortalGuard } from "../client-portal.guard";
import { Portal, PortalContext } from "../portal-context.decorator";
import { PortalProjectsService } from "./portal-projects.service";

@Controller("client-portal/projects")
@UseGuards(ClientPortalGuard)
export class PortalProjectsController {
  constructor(private readonly svc: PortalProjectsService) {}

  @Get()
  list(@Portal() portal: PortalContext) {
    return this.svc.list(portal.clientId);
  }

  @Get(":id")
  detail(@Portal() portal: PortalContext, @Param("id") id: string) {
    return this.svc.detail(portal.clientId, id);
  }

  @Get(":id/tasks")
  tasks(@Portal() portal: PortalContext, @Param("id") id: string) {
    return this.svc.tasks(portal.clientId, id);
  }
}
```

- [ ] **Step 3: Register in module**

Add to `client-portal.module.ts` `controllers` and `providers`:

```typescript
import { PortalProjectsController } from "./projects/portal-projects.controller";
import { PortalProjectsService } from "./projects/portal-projects.service";
// ...
controllers: [PortalAuthController, PortalProjectsController],
providers: [ClientPortalGuard, PortalAuthService, MailService, PortalProjectsService],
```

- [ ] **Step 4: Verify build**

Run: `npm run build --workspace @nuro7/api`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/client-portal
git commit -m "feat(api): portal projects + tasks endpoints"
```

### Task 3.3: Invoices endpoints

**Files:**
- Create: `apps/api/src/modules/client-portal/invoices/portal-invoices.controller.ts`
- Create: `apps/api/src/modules/client-portal/invoices/portal-invoices.service.ts`
- Modify: `apps/api/src/modules/client-portal/client-portal.module.ts`

- [ ] **Step 1: Service**

```typescript
// apps/api/src/modules/client-portal/invoices/portal-invoices.service.ts
import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { serializeInvoice } from "../serializers";

@Injectable()
export class PortalInvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(clientId: string) {
    const rows = await this.prisma.invoice.findMany({
      where: { clientId, status: { not: "DRAFT" } },
      orderBy: { issueDate: "desc" },
    });
    return rows.map(serializeInvoice);
  }

  async detail(clientId: string, id: string) {
    const inv = await this.prisma.invoice.findFirst({
      where: { id, clientId, status: { not: "DRAFT" } },
      include: { items: true },
    });
    if (!inv) throw new NotFoundException();
    return {
      ...serializeInvoice(inv),
      items: inv.items.map((it) => ({
        id: it.id,
        description: it.description,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        total: it.total,
      })),
    };
  }

  async assertOwned(clientId: string, id: string) {
    const inv = await this.prisma.invoice.findFirst({ where: { id, clientId, status: { not: "DRAFT" } } });
    if (!inv) throw new NotFoundException();
    return inv;
  }
}
```

- [ ] **Step 2: Controller (PDF reuses existing renderer)**

Inspect first which service renders invoice PDFs. Run:
```bash
grep -rn "pdf" apps/api/src/modules/invoices apps/api/src/common/pdf | head
```
Use the same renderer dependency. The controller below assumes a `renderInvoicePdf(id)` helper in `common/pdf` returning a `Buffer`. Replace with the actual function the staff route uses.

```typescript
// apps/api/src/modules/client-portal/invoices/portal-invoices.controller.ts
import { Controller, Get, Param, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { ClientPortalGuard } from "../client-portal.guard";
import { Portal, PortalContext } from "../portal-context.decorator";
import { PortalInvoicesService } from "./portal-invoices.service";
import { InvoicesService } from "../../invoices/invoices.service";

@Controller("client-portal/invoices")
@UseGuards(ClientPortalGuard)
export class PortalInvoicesController {
  constructor(private readonly svc: PortalInvoicesService, private readonly staff: InvoicesService) {}

  @Get()
  list(@Portal() p: PortalContext) {
    return this.svc.list(p.clientId);
  }

  @Get(":id")
  detail(@Portal() p: PortalContext, @Param("id") id: string) {
    return this.svc.detail(p.clientId, id);
  }

  @Get(":id/pdf")
  async pdf(@Portal() p: PortalContext, @Param("id") id: string, @Res() res: Response) {
    await this.svc.assertOwned(p.clientId, id);
    // Reuse staff PDF generator; replace `renderPdf` with the real method name.
    const buffer = await (this.staff as any).renderPdf(id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="invoice-${id}.pdf"`);
    return res.send(buffer);
  }
}
```

If `InvoicesService` does not expose a PDF method, add one or extract the renderer to `common/pdf/invoice.ts` and import from both controllers (a small refactor, kept inside this task).

- [ ] **Step 3: Module wiring**

Add `PortalInvoicesController` to `controllers`, `PortalInvoicesService` to `providers`, and `imports: [InvoicesModule]` (export `InvoicesService` from `InvoicesModule` if not already exported).

- [ ] **Step 4: Verify build**

`npm run build --workspace @nuro7/api`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/client-portal apps/api/src/modules/invoices
git commit -m "feat(api): portal invoices endpoints + PDF reuse"
```

### Task 3.4: Proposals endpoints (list, detail, decide)

**Files:**
- Create: `apps/api/src/modules/client-portal/proposals/portal-proposals.controller.ts`
- Create: `apps/api/src/modules/client-portal/proposals/portal-proposals.service.ts`
- Create: `apps/api/src/modules/client-portal/proposals/dto.ts`
- Modify: `apps/api/src/modules/client-portal/client-portal.module.ts`

- [ ] **Step 1: DTO**

```typescript
// apps/api/src/modules/client-portal/proposals/dto.ts
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

export class DecideDto {
  @IsEnum(["ACCEPTED", "REJECTED"])
  decision!: "ACCEPTED" | "REJECTED";

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
```

- [ ] **Step 2: Service**

```typescript
// apps/api/src/modules/client-portal/proposals/portal-proposals.service.ts
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { serializeProposal } from "../serializers";
import type { DecideDto } from "./dto";

@Injectable()
export class PortalProposalsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(clientId: string) {
    const rows = await this.prisma.proposal.findMany({
      where: { clientId, status: { in: ["SENT", "ACCEPTED", "REJECTED"] } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(serializeProposal);
  }

  async detail(clientId: string, id: string) {
    const p = await this.prisma.proposal.findFirst({
      where: { id, clientId, status: { in: ["SENT", "ACCEPTED", "REJECTED"] } },
      include: { blocks: true, deliverables: true, acceptance: true },
    });
    if (!p) throw new NotFoundException();
    return {
      ...serializeProposal(p),
      blocks: p.blocks,
      deliverables: p.deliverables,
      acceptance: p.acceptance
        ? { decision: p.acceptance.decision, decidedAt: p.acceptance.decidedAt, note: p.acceptance.note }
        : null,
    };
  }

  async decide(
    clientId: string,
    contactId: string,
    proposalId: string,
    dto: DecideDto,
    ip: string,
    userAgent: string,
  ) {
    const p = await this.prisma.proposal.findFirst({ where: { id: proposalId, clientId } });
    if (!p) throw new NotFoundException();
    if (p.status !== "SENT") throw new ConflictException("already-decided");

    return this.prisma.$transaction(async (tx) => {
      try {
        await tx.proposalAcceptance.create({
          data: { proposalId, contactId, decision: dto.decision, note: dto.note ?? null, ip, userAgent },
        });
      } catch (err: any) {
        if (err?.code === "P2002") throw new ConflictException("already-decided");
        throw err;
      }
      await tx.proposal.update({
        where: { id: proposalId },
        data: { status: dto.decision },
      });
      return { ok: true };
    });
  }
}
```

- [ ] **Step 3: Controller**

```typescript
// apps/api/src/modules/client-portal/proposals/portal-proposals.controller.ts
import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import type { Request } from "express";
import { ClientPortalGuard } from "../client-portal.guard";
import { Portal, PortalContext } from "../portal-context.decorator";
import { DecideDto } from "./dto";
import { PortalProposalsService } from "./portal-proposals.service";

@Controller("client-portal/proposals")
@UseGuards(ClientPortalGuard, ThrottlerGuard)
export class PortalProposalsController {
  constructor(private readonly svc: PortalProposalsService) {}

  @Get()
  list(@Portal() p: PortalContext) {
    return this.svc.list(p.clientId);
  }

  @Get(":id")
  detail(@Portal() p: PortalContext, @Param("id") id: string) {
    return this.svc.detail(p.clientId, id);
  }

  @Post(":id/decide")
  @Throttle({ default: { limit: 10, ttl: 60 * 60 * 1000 } })
  decide(
    @Portal() p: PortalContext,
    @Param("id") id: string,
    @Body() dto: DecideDto,
    @Req() req: Request,
  ) {
    return this.svc.decide(
      p.clientId,
      p.contactId,
      id,
      dto,
      req.ip ?? "",
      req.headers["user-agent"] ?? "",
    );
  }
}
```

- [ ] **Step 4: Register in module**

Add controller + service to `client-portal.module.ts`.

- [ ] **Step 5: Verify build + commit**

```bash
npm run build --workspace @nuro7/api
git add apps/api/src/modules/client-portal
git commit -m "feat(api): portal proposals endpoints"
```

### Task 3.5: Client requests endpoints (list, detail, create, reply)

**Files:**
- Create: `apps/api/src/modules/client-portal/requests/portal-requests.controller.ts`
- Create: `apps/api/src/modules/client-portal/requests/portal-requests.service.ts`
- Create: `apps/api/src/modules/client-portal/requests/dto.ts`
- Modify: `apps/api/src/modules/client-portal/client-portal.module.ts`

- [ ] **Step 1: DTOs**

```typescript
// apps/api/src/modules/client-portal/requests/dto.ts
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateRequestDto {
  @IsString() @MinLength(3) @MaxLength(200)
  title!: string;

  @IsString() @MinLength(1) @MaxLength(10_000)
  body!: string;

  @IsOptional() @IsString()
  projectId?: string;
}

export class ReplyDto {
  @IsString() @MinLength(1) @MaxLength(10_000)
  body!: string;
}

export class ListQueryDto {
  @IsOptional()
  @IsEnum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"])
  status?: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
}
```

- [ ] **Step 2: Service**

```typescript
// apps/api/src/modules/client-portal/requests/portal-requests.service.ts
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { serializeRequest, serializeRequestMessage } from "../serializers";
import type { CreateRequestDto, ReplyDto } from "./dto";

@Injectable()
export class PortalRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(clientId: string, status?: string) {
    const rows = await this.prisma.clientRequest.findMany({
      where: { clientId, ...(status ? { status: status as any } : {}) },
      orderBy: { updatedAt: "desc" },
    });
    return rows.map(serializeRequest);
  }

  async detail(clientId: string, id: string) {
    const r = await this.prisma.clientRequest.findFirst({
      where: { id, clientId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          include: { authorContact: true, authorUser: true },
        },
      },
    });
    if (!r) throw new NotFoundException();
    return {
      ...serializeRequest(r),
      body: r.body,
      messages: r.messages.map(serializeRequestMessage),
    };
  }

  async create(clientId: string, contactId: string, dto: CreateRequestDto) {
    if (dto.projectId) {
      const owns = await this.prisma.project.findFirst({
        where: { id: dto.projectId, clientId },
        select: { id: true },
      });
      if (!owns) throw new BadRequestException("invalid_project");
    }
    const created = await this.prisma.clientRequest.create({
      data: {
        clientId,
        createdById: contactId,
        title: dto.title,
        body: dto.body,
        projectId: dto.projectId ?? null,
      },
    });
    return serializeRequest(created);
  }

  async reply(clientId: string, contactId: string, requestId: string, dto: ReplyDto) {
    const r = await this.prisma.clientRequest.findFirst({ where: { id: requestId, clientId } });
    if (!r) throw new NotFoundException();
    await this.prisma.$transaction([
      this.prisma.clientRequestMessage.create({
        data: { requestId, authorContactId: contactId, body: dto.body },
      }),
      this.prisma.clientRequest.update({
        where: { id: requestId },
        data: { updatedAt: new Date() },
      }),
    ]);
    return { ok: true };
  }
}
```

- [ ] **Step 3: Controller**

```typescript
// apps/api/src/modules/client-portal/requests/portal-requests.controller.ts
import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { ClientPortalGuard } from "../client-portal.guard";
import { Portal, PortalContext } from "../portal-context.decorator";
import { CreateRequestDto, ListQueryDto, ReplyDto } from "./dto";
import { PortalRequestsService } from "./portal-requests.service";

@Controller("client-portal/requests")
@UseGuards(ClientPortalGuard, ThrottlerGuard)
export class PortalRequestsController {
  constructor(private readonly svc: PortalRequestsService) {}

  @Get()
  list(@Portal() p: PortalContext, @Query() q: ListQueryDto) {
    return this.svc.list(p.clientId, q.status);
  }

  @Get(":id")
  detail(@Portal() p: PortalContext, @Param("id") id: string) {
    return this.svc.detail(p.clientId, id);
  }

  @Post()
  @Throttle({ default: { limit: 30, ttl: 60 * 60 * 1000 } })
  create(@Portal() p: PortalContext, @Body() dto: CreateRequestDto) {
    return this.svc.create(p.clientId, p.contactId, dto);
  }

  @Post(":id/messages")
  @Throttle({ default: { limit: 120, ttl: 60 * 60 * 1000 } })
  reply(@Portal() p: PortalContext, @Param("id") id: string, @Body() dto: ReplyDto) {
    return this.svc.reply(p.clientId, p.contactId, id, dto);
  }
}
```

- [ ] **Step 4: Module wiring**

Add the new controller + service to `client-portal.module.ts`.

- [ ] **Step 5: Verify + commit**

```bash
npm run build --workspace @nuro7/api
git add apps/api/src/modules/client-portal
git commit -m "feat(api): portal client-requests endpoints"
```

### Task 3.6: `/me` and `/dashboard`

**Files:**
- Create: `apps/api/src/modules/client-portal/me/portal-me.controller.ts`
- Create: `apps/api/src/modules/client-portal/me/portal-me.service.ts`
- Modify: `apps/api/src/modules/client-portal/client-portal.module.ts`

- [ ] **Step 1: Service**

```typescript
// apps/api/src/modules/client-portal/me/portal-me.service.ts
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";

@Injectable()
export class PortalMeService {
  constructor(private readonly prisma: PrismaService) {}

  async me(contactId: string, clientId: string) {
    const [contact, org] = await Promise.all([
      this.prisma.clientContact.findUnique({ where: { id: contactId } }),
      this.prisma.organizationSettings.findFirst().catch(() => null),
    ]);
    return {
      contactId,
      clientId,
      name: contact?.name ?? null,
      email: contact?.email ?? "",
      orgName: org?.name ?? "Portal",
      orgLogoUrl: org?.logoUrl ?? null,
    };
  }

  async dashboard(clientId: string) {
    const now = new Date();
    const [activeProjectCount, nextMilestone, outstanding, openRequestCount, recentInvoices, recentRequests] =
      await Promise.all([
        this.prisma.project.count({ where: { clientId, status: { in: ["ACTIVE", "IN_PROGRESS"] } } }),
        this.prisma.milestone.findFirst({
          where: { project: { clientId }, dueDate: { gte: now } },
          orderBy: { dueDate: "asc" },
          select: { id: true, title: true, dueDate: true },
        }),
        this.prisma.invoice.aggregate({
          where: { clientId, status: { in: ["SENT", "OVERDUE", "PARTIAL"] } },
          _sum: { total: true },
        }),
        this.prisma.clientRequest.count({ where: { clientId, status: { in: ["OPEN", "IN_PROGRESS"] } } }),
        this.prisma.invoice.findMany({
          where: { clientId, status: { not: "DRAFT" } },
          orderBy: { issueDate: "desc" },
          take: 5,
          select: { id: true, number: true, total: true, status: true, issueDate: true },
        }),
        this.prisma.clientRequest.findMany({
          where: { clientId },
          orderBy: { updatedAt: "desc" },
          take: 5,
          select: { id: true, title: true, status: true, updatedAt: true },
        }),
      ]);
    return {
      activeProjectCount,
      nextMilestone,
      outstandingBalance: outstanding._sum.total ?? 0,
      openRequestCount,
      recentInvoices,
      recentRequests,
    };
  }
}
```

> Note: project active statuses and invoice unpaid statuses use placeholders `ACTIVE`/`IN_PROGRESS` and `SENT`/`OVERDUE`/`PARTIAL`. **Open `ProjectStatus` and `InvoiceStatus` enums in `schema.prisma` and replace these with the actual values used in the codebase before running.** Adjust `OrganizationSettings` model name if it differs.

- [ ] **Step 2: Controller**

```typescript
// apps/api/src/modules/client-portal/me/portal-me.controller.ts
import { Controller, Get, UseGuards } from "@nestjs/common";
import { ClientPortalGuard } from "../client-portal.guard";
import { Portal, PortalContext } from "../portal-context.decorator";
import { PortalMeService } from "./portal-me.service";

@Controller("client-portal")
@UseGuards(ClientPortalGuard)
export class PortalMeController {
  constructor(private readonly svc: PortalMeService) {}

  @Get("me")
  me(@Portal() p: PortalContext) {
    return this.svc.me(p.contactId, p.clientId);
  }

  @Get("dashboard")
  dashboard(@Portal() p: PortalContext) {
    return this.svc.dashboard(p.clientId);
  }
}
```

- [ ] **Step 3: Module wiring**

Add controller + service to `client-portal.module.ts`.

- [ ] **Step 4: Verify + commit**

```bash
npm run build --workspace @nuro7/api
git add apps/api/src/modules/client-portal
git commit -m "feat(api): portal /me and /dashboard"
```

### Task 3.7: Notifications fan-out on request create / reply

**Files:**
- Modify: `apps/api/src/modules/client-portal/requests/portal-requests.service.ts`

- [ ] **Step 1: Inspect notifications service**

Run:
```bash
ls apps/api/src/modules/notifications && grep -n "create" apps/api/src/modules/notifications/notifications.service.ts | head
```

Identify the public method that creates a notification for a `User` (likely `notify(userId, type, payload)` or similar).

- [ ] **Step 2: Inject `NotificationsService` and emit on create + reply**

In `portal-requests.service.ts`:

```typescript
constructor(
  private readonly prisma: PrismaService,
  private readonly notifications: NotificationsService,
) {}
```

After successful `create`, fan out to PM (or fall back to admins):

```typescript
const recipients = await this.findRecipients(clientId, dto.projectId);
await Promise.all(
  recipients.map((userId) =>
    this.notifications.notify(userId, "CLIENT_REQUEST_CREATED", {
      requestId: created.id,
      title: created.title,
    }),
  ),
);
```

Add a private helper:

```typescript
private async findRecipients(clientId: string, projectId?: string | null): Promise<string[]> {
  if (projectId) {
    const pm = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { managerId: true },
    });
    if (pm?.managerId) return [pm.managerId];
  }
  // fallback: client account manager (if model has one) or all admins
  const admins = await this.prisma.user.findMany({
    where: { roles: { some: { role: { code: { in: ["SUPER_ADMIN", "ADMIN"] } } } } },
    select: { id: true },
  });
  return admins.map((u) => u.id);
}
```

> Replace `managerId` with the actual project-manager FK column name (verify in `schema.prisma`).

Do the same for `reply`, sending to PM/admins; for staff replies → contact, see Task 5.x.

- [ ] **Step 3: Module wiring**

Import `NotificationsModule` in `client-portal.module.ts`. If `NotificationsService` is not exported there, export it.

- [ ] **Step 4: Verify + commit**

```bash
npm run build --workspace @nuro7/api
git add apps/api/src/modules/client-portal apps/api/src/modules/notifications
git commit -m "feat(api): portal request notifications fan-out"
```

---

## Phase 4 — Web portal UI

### Task 4.1: Portal API client (web side)

**Files:**
- Create: `apps/web/lib/portal-api.ts`

- [ ] **Step 1: Implement**

```typescript
// apps/web/lib/portal-api.ts
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}/api/v1/client-portal${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    ...init,
  });
  if (res.status === 401) {
    if (typeof window !== "undefined") window.location.href = "/portal/login";
    throw new Error("unauthenticated");
  }
  if (!res.ok) throw new Error(`request_failed_${res.status}`);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const portalApi = {
  me: () => call<{ contactId: string; clientId: string; name: string | null; email: string; orgName: string; orgLogoUrl: string | null }>("/me"),
  dashboard: () => call<any>("/dashboard"),
  projects: {
    list: () => call<any[]>("/projects"),
    detail: (id: string) => call<any>(`/projects/${id}`),
    tasks: (id: string) => call<any[]>(`/projects/${id}/tasks`),
  },
  invoices: {
    list: () => call<any[]>("/invoices"),
    detail: (id: string) => call<any>(`/invoices/${id}`),
    pdfUrl: (id: string) => `${BASE}/api/v1/client-portal/invoices/${id}/pdf`,
  },
  proposals: {
    list: () => call<any[]>("/proposals"),
    detail: (id: string) => call<any>(`/proposals/${id}`),
    decide: (id: string, decision: "ACCEPTED" | "REJECTED", note?: string) =>
      call<{ ok: true }>(`/proposals/${id}/decide`, { method: "POST", body: JSON.stringify({ decision, note }) }),
  },
  requests: {
    list: (status?: string) => call<any[]>(`/requests${status ? `?status=${status}` : ""}`),
    detail: (id: string) => call<any>(`/requests/${id}`),
    create: (input: { title: string; body: string; projectId?: string }) =>
      call<any>("/requests", { method: "POST", body: JSON.stringify(input) }),
    reply: (id: string, body: string) =>
      call<{ ok: true }>(`/requests/${id}/messages`, { method: "POST", body: JSON.stringify({ body }) }),
  },
  auth: {
    requestLink: (email: string) =>
      call<{ ok: true }>("/auth/request-link", { method: "POST", body: JSON.stringify({ email }) }),
    logout: () => call<{ ok: true }>("/auth/logout", { method: "POST" }),
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/lib/portal-api.ts
git commit -m "feat(web): portal api client"
```

### Task 4.2: Portal middleware redirect

**Files:**
- Modify: `apps/web/middleware.ts` (create if missing)

- [ ] **Step 1: Inspect existing middleware**

Run: `cat apps/web/middleware.ts 2>/dev/null || echo "no middleware yet"`

- [ ] **Step 2: Add portal matcher**

If a middleware already exists, extend it; otherwise create:

```typescript
// apps/web/middleware.ts
import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/portal")) {
    if (pathname === "/portal/login" || pathname.startsWith("/portal/auth/verify")) {
      return NextResponse.next();
    }
    const cp = req.cookies.get("cp_session");
    if (!cp) {
      const url = req.nextUrl.clone();
      url.pathname = "/portal/login";
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/portal/:path*"],
};
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/middleware.ts
git commit -m "feat(web): portal auth middleware"
```

### Task 4.3: Portal layout + login + verify pages

**Files:**
- Create: `apps/web/app/(portal)/portal/layout.tsx`
- Create: `apps/web/app/(portal)/portal/login/page.tsx`
- Create: `apps/web/app/(portal)/portal/auth/verify/page.tsx`

- [ ] **Step 1: Layout**

```tsx
// apps/web/app/(portal)/portal/layout.tsx
"use client";
import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { portalApi } from "@/lib/portal-api";

export default function PortalLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<{ name: string | null; email: string; orgName: string; orgLogoUrl: string | null } | null>(null);

  const isAuthPage = pathname === "/portal/login" || pathname?.startsWith("/portal/auth/verify");

  useEffect(() => {
    if (isAuthPage) return;
    portalApi.me().then(setMe).catch(() => {});
  }, [isAuthPage]);

  const logout = async () => {
    await portalApi.auth.logout().catch(() => {});
    router.push("/portal/login");
  };

  if (isAuthPage) return <main className="min-h-screen bg-neutral-50">{children}</main>;

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            {me?.orgLogoUrl ? <img src={me.orgLogoUrl} alt="" className="h-7" /> : null}
            <span className="font-semibold">{me?.orgName ?? "Portal"}</span>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/portal">Dashboard</Link>
            <Link href="/portal/projects">Projects</Link>
            <Link href="/portal/invoices">Invoices</Link>
            <Link href="/portal/proposals">Proposals</Link>
            <Link href="/portal/requests">Requests</Link>
            <button onClick={logout} className="text-neutral-600 hover:text-black">Logout</button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Login page**

```tsx
// apps/web/app/(portal)/portal/login/page.tsx
"use client";
import { FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";
import { portalApi } from "@/lib/portal-api";

export default function LoginPage() {
  const sp = useSearchParams();
  const error = sp.get("e");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await portalApi.auth.requestLink(email);
      setSent(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto mt-24 max-w-md rounded-lg border bg-white p-6 shadow-sm">
      <h1 className="text-xl font-semibold">Sign in</h1>
      <p className="mt-1 text-sm text-neutral-600">We&apos;ll email you a one-time login link.</p>
      {error === "invalid" && (
        <p className="mt-3 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
          That link is invalid or expired. Request a new one below.
        </p>
      )}
      {sent ? (
        <p className="mt-4 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Check your inbox. The link expires in 15 minutes.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full rounded border px-3 py-2"
          />
          <button disabled={busy} className="w-full rounded bg-black px-3 py-2 text-white disabled:opacity-50">
            {busy ? "Sending…" : "Send link"}
          </button>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify page**

```tsx
// apps/web/app/(portal)/portal/auth/verify/page.tsx
export default function VerifyPage() {
  // The API hits /api/v1/client-portal/auth/verify directly via the email link;
  // this page is only reached if someone navigates here without a token.
  return (
    <div className="mx-auto mt-24 max-w-md rounded-lg border bg-white p-6 text-center shadow-sm">
      <p>Verifying…</p>
    </div>
  );
}
```

> The email link points at the API host (`/api/v1/client-portal/auth/verify`), which then redirects to `/portal`. The Next.js `verify` page is a fallback only.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app
git commit -m "feat(web): portal layout + login + verify"
```

### Task 4.4: Dashboard + projects pages

**Files:**
- Create: `apps/web/app/(portal)/portal/page.tsx`
- Create: `apps/web/app/(portal)/portal/projects/page.tsx`
- Create: `apps/web/app/(portal)/portal/projects/[id]/page.tsx`

- [ ] **Step 1: Dashboard**

```tsx
// apps/web/app/(portal)/portal/page.tsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { portalApi } from "@/lib/portal-api";

export default function PortalDashboard() {
  const [d, setD] = useState<any>(null);
  useEffect(() => { portalApi.dashboard().then(setD); }, []);
  if (!d) return <p>Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card label="Active projects" value={d.activeProjectCount} />
        <Card label="Outstanding balance" value={fmtMoney(d.outstandingBalance)} />
        <Card label="Open requests" value={d.openRequestCount} />
      </div>

      <Section title="Recent invoices" href="/portal/invoices">
        <ul className="divide-y">
          {d.recentInvoices.map((i: any) => (
            <li key={i.id} className="flex items-center justify-between py-2 text-sm">
              <Link href={`/portal/invoices/${i.id}`} className="font-medium">{i.number}</Link>
              <span className="text-neutral-600">{i.status}</span>
              <span>{fmtMoney(i.total)}</span>
            </li>
          ))}
          {d.recentInvoices.length === 0 && <li className="py-2 text-sm text-neutral-500">No invoices yet.</li>}
        </ul>
      </Section>

      <Section title="Recent requests" href="/portal/requests">
        <ul className="divide-y">
          {d.recentRequests.map((r: any) => (
            <li key={r.id} className="flex items-center justify-between py-2 text-sm">
              <Link href={`/portal/requests/${r.id}`} className="font-medium">{r.title}</Link>
              <span className="text-neutral-600">{r.status}</span>
            </li>
          ))}
          {d.recentRequests.length === 0 && <li className="py-2 text-sm text-neutral-500">No requests yet.</li>}
        </ul>
      </Section>
    </div>
  );
}

function Card({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded border bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function Section({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <section className="rounded border bg-white">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <h2 className="font-medium">{title}</h2>
        <Link href={href} className="text-sm text-neutral-600 hover:underline">View all</Link>
      </div>
      <div className="px-4">{children}</div>
    </section>
  );
}

function fmtMoney(n: number | string) {
  const v = typeof n === "string" ? Number(n) : n;
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(v || 0);
}
```

- [ ] **Step 2: Projects list**

```tsx
// apps/web/app/(portal)/portal/projects/page.tsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { portalApi } from "@/lib/portal-api";

export default function PortalProjects() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { portalApi.projects.list().then(setRows); }, []);
  return (
    <div className="rounded border bg-white">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 text-left">
          <tr><th className="p-3">Name</th><th className="p-3">Status</th><th className="p-3">% Complete</th><th className="p-3">Due</th></tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-t">
              <td className="p-3"><Link href={`/portal/projects/${p.id}`} className="font-medium">{p.name}</Link></td>
              <td className="p-3">{p.status}</td>
              <td className="p-3">{p.percentComplete ?? "—"}{p.percentComplete != null ? "%" : ""}</td>
              <td className="p-3">{p.dueDate ? new Date(p.dueDate).toLocaleDateString() : "—"}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-neutral-500">No projects.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Project detail (with Tasks + Milestones tabs)**

```tsx
// apps/web/app/(portal)/portal/projects/[id]/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { portalApi } from "@/lib/portal-api";

export default function PortalProjectDetail() {
  const params = useParams<{ id: string }>();
  const [project, setProject] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [tab, setTab] = useState<"tasks" | "milestones">("tasks");

  useEffect(() => {
    portalApi.projects.detail(params.id).then(setProject);
    portalApi.projects.tasks(params.id).then(setTasks);
  }, [params.id]);

  if (!project) return <p>Loading…</p>;
  return (
    <div className="space-y-4">
      <header className="rounded border bg-white p-4">
        <h1 className="text-xl font-semibold">{project.name}</h1>
        <div className="mt-1 text-sm text-neutral-600">
          {project.status} · due {project.dueDate ? new Date(project.dueDate).toLocaleDateString() : "—"}
          {project.percentComplete != null && ` · ${project.percentComplete}% complete`}
        </div>
      </header>

      <div className="flex gap-2 border-b">
        <button onClick={() => setTab("tasks")} className={`px-3 py-2 text-sm ${tab==="tasks"?"border-b-2 border-black font-medium":""}`}>Tasks</button>
        <button onClick={() => setTab("milestones")} className={`px-3 py-2 text-sm ${tab==="milestones"?"border-b-2 border-black font-medium":""}`}>Milestones</button>
      </div>

      {tab === "tasks" ? (
        <ul className="divide-y rounded border bg-white">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-center justify-between p-3 text-sm">
              <span>{t.title}</span>
              <span className="text-neutral-600">{t.status}{t.dueDate ? ` · ${new Date(t.dueDate).toLocaleDateString()}` : ""}</span>
            </li>
          ))}
          {tasks.length === 0 && <li className="p-6 text-center text-neutral-500">No client-visible tasks yet.</li>}
        </ul>
      ) : (
        <ul className="divide-y rounded border bg-white">
          {project.milestones.map((m: any) => (
            <li key={m.id} className="flex items-center justify-between p-3 text-sm">
              <span>{m.title}</span>
              <span className="text-neutral-600">{m.status}{m.dueDate ? ` · ${new Date(m.dueDate).toLocaleDateString()}` : ""}</span>
            </li>
          ))}
          {project.milestones.length === 0 && <li className="p-6 text-center text-neutral-500">No milestones.</li>}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app
git commit -m "feat(web): portal dashboard + projects pages"
```

### Task 4.5: Invoices pages

**Files:**
- Create: `apps/web/app/(portal)/portal/invoices/page.tsx`
- Create: `apps/web/app/(portal)/portal/invoices/[id]/page.tsx`

- [ ] **Step 1: List**

```tsx
// apps/web/app/(portal)/portal/invoices/page.tsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { portalApi } from "@/lib/portal-api";

export default function PortalInvoices() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { portalApi.invoices.list().then(setRows); }, []);
  return (
    <div className="rounded border bg-white">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 text-left">
          <tr><th className="p-3">Number</th><th className="p-3">Issued</th><th className="p-3">Due</th><th className="p-3">Total</th><th className="p-3">Status</th><th className="p-3"></th></tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <tr key={i.id} className="border-t">
              <td className="p-3"><Link href={`/portal/invoices/${i.id}`} className="font-medium">{i.number}</Link></td>
              <td className="p-3">{new Date(i.issueDate).toLocaleDateString()}</td>
              <td className="p-3">{i.dueDate ? new Date(i.dueDate).toLocaleDateString() : "—"}</td>
              <td className="p-3">{i.total}</td>
              <td className="p-3">{i.status}</td>
              <td className="p-3"><a href={portalApi.invoices.pdfUrl(i.id)} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">PDF</a></td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-neutral-500">No invoices.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Detail**

```tsx
// apps/web/app/(portal)/portal/invoices/[id]/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { portalApi } from "@/lib/portal-api";

export default function PortalInvoiceDetail() {
  const params = useParams<{ id: string }>();
  const [inv, setInv] = useState<any>(null);
  useEffect(() => { portalApi.invoices.detail(params.id).then(setInv); }, [params.id]);
  if (!inv) return <p>Loading…</p>;
  return (
    <div className="space-y-4">
      <header className="rounded border bg-white p-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Invoice {inv.number}</h1>
          <div className="text-sm text-neutral-600">{inv.status} · issued {new Date(inv.issueDate).toLocaleDateString()}</div>
        </div>
        <a href={portalApi.invoices.pdfUrl(inv.id)} target="_blank" rel="noreferrer" className="rounded bg-black px-3 py-2 text-sm text-white">Download PDF</a>
      </header>
      <table className="w-full rounded border bg-white text-sm">
        <thead className="bg-neutral-50 text-left">
          <tr><th className="p-3">Description</th><th className="p-3">Qty</th><th className="p-3">Unit</th><th className="p-3">Total</th></tr>
        </thead>
        <tbody>
          {inv.items.map((it: any) => (
            <tr key={it.id} className="border-t"><td className="p-3">{it.description}</td><td className="p-3">{it.quantity}</td><td className="p-3">{it.unitPrice}</td><td className="p-3">{it.total}</td></tr>
          ))}
        </tbody>
        <tfoot><tr className="border-t bg-neutral-50"><td colSpan={3} className="p-3 text-right font-medium">Total</td><td className="p-3 font-medium">{inv.total}</td></tr></tfoot>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app
git commit -m "feat(web): portal invoices pages"
```

### Task 4.6: Proposals pages

**Files:**
- Create: `apps/web/app/(portal)/portal/proposals/page.tsx`
- Create: `apps/web/app/(portal)/portal/proposals/[id]/page.tsx`

- [ ] **Step 1: List**

```tsx
// apps/web/app/(portal)/portal/proposals/page.tsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { portalApi } from "@/lib/portal-api";

export default function PortalProposals() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { portalApi.proposals.list().then(setRows); }, []);
  return (
    <ul className="divide-y rounded border bg-white">
      {rows.map((p) => (
        <li key={p.id} className="flex items-center justify-between p-3 text-sm">
          <Link href={`/portal/proposals/${p.id}`} className="font-medium">{p.title}</Link>
          <span className="text-neutral-600">{p.status}</span>
        </li>
      ))}
      {rows.length === 0 && <li className="p-6 text-center text-neutral-500">No proposals.</li>}
    </ul>
  );
}
```

- [ ] **Step 2: Detail with Accept/Reject**

```tsx
// apps/web/app/(portal)/portal/proposals/[id]/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { portalApi } from "@/lib/portal-api";

export default function PortalProposalDetail() {
  const params = useParams<{ id: string }>();
  const [p, setP] = useState<any>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = () => portalApi.proposals.detail(params.id).then(setP);
  useEffect(() => { load(); }, [params.id]);

  const decide = async (decision: "ACCEPTED" | "REJECTED") => {
    setBusy(true); setErr(null);
    try {
      await portalApi.proposals.decide(params.id, decision, note || undefined);
      await load();
    } catch (e: any) {
      setErr(e?.message ?? "failed");
    } finally {
      setBusy(false);
    }
  };

  if (!p) return <p>Loading…</p>;
  const decided = p.acceptance != null;

  return (
    <div className="space-y-4">
      <header className="rounded border bg-white p-4">
        <h1 className="text-xl font-semibold">{p.title}</h1>
        <div className="text-sm text-neutral-600">{p.status}{p.sentAt ? ` · sent ${new Date(p.sentAt).toLocaleDateString()}` : ""}</div>
      </header>

      <div className="rounded border bg-white p-4 space-y-3">
        {p.blocks.map((b: any) => (
          <div key={b.id}>
            {b.title && <h3 className="font-medium">{b.title}</h3>}
            <p className="whitespace-pre-wrap text-sm">{b.body ?? ""}</p>
          </div>
        ))}
      </div>

      {!decided && p.status === "SENT" ? (
        <div className="rounded border bg-white p-4 space-y-3">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note"
            className="w-full rounded border px-3 py-2 text-sm"
            rows={3}
          />
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => decide("ACCEPTED")} className="rounded bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-50">Accept</button>
            <button disabled={busy} onClick={() => decide("REJECTED")} className="rounded bg-rose-600 px-3 py-2 text-sm text-white disabled:opacity-50">Reject</button>
          </div>
          {err && <p className="text-sm text-rose-700">{err}</p>}
        </div>
      ) : decided ? (
        <p className="text-sm text-neutral-600">Decision recorded {new Date(p.acceptance.decidedAt).toLocaleString()}: <strong>{p.acceptance.decision}</strong>{p.acceptance.note ? ` — ${p.acceptance.note}` : ""}.</p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app
git commit -m "feat(web): portal proposals pages with accept/reject"
```

### Task 4.7: Requests pages (list, new, detail/thread)

**Files:**
- Create: `apps/web/app/(portal)/portal/requests/page.tsx`
- Create: `apps/web/app/(portal)/portal/requests/new/page.tsx`
- Create: `apps/web/app/(portal)/portal/requests/[id]/page.tsx`

- [ ] **Step 1: List**

```tsx
// apps/web/app/(portal)/portal/requests/page.tsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { portalApi } from "@/lib/portal-api";

export default function PortalRequests() {
  const [rows, setRows] = useState<any[]>([]);
  const [status, setStatus] = useState("");
  useEffect(() => { portalApi.requests.list(status || undefined).then(setRows); }, [status]);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded border px-2 py-1 text-sm">
          <option value="">All</option>
          <option value="OPEN">Open</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed</option>
        </select>
        <Link href="/portal/requests/new" className="rounded bg-black px-3 py-2 text-sm text-white">New request</Link>
      </div>
      <ul className="divide-y rounded border bg-white">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between p-3 text-sm">
            <Link href={`/portal/requests/${r.id}`} className="font-medium">{r.title}</Link>
            <span className="text-neutral-600">{r.status} · {new Date(r.updatedAt).toLocaleDateString()}</span>
          </li>
        ))}
        {rows.length === 0 && <li className="p-6 text-center text-neutral-500">No requests.</li>}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: New**

```tsx
// apps/web/app/(portal)/portal/requests/new/page.tsx
"use client";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { portalApi } from "@/lib/portal-api";

export default function NewRequest() {
  const router = useRouter();
  const [projects, setProjects] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { portalApi.projects.list().then(setProjects); }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const created = await portalApi.requests.create({ title, body, projectId: projectId || undefined });
      router.push(`/portal/requests/${created.id}`);
    } catch (e: any) {
      setErr(e?.message ?? "failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-xl space-y-3 rounded border bg-white p-4">
      <h1 className="text-xl font-semibold">New request</h1>
      <input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} className="w-full rounded border px-3 py-2" placeholder="Title" />
      <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full rounded border px-3 py-2">
        <option value="">No specific project</option>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} required rows={6} className="w-full rounded border px-3 py-2" placeholder="Describe what you need…" />
      <div className="flex justify-end gap-2">
        <button disabled={busy} className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50">{busy ? "Sending…" : "Submit"}</button>
      </div>
      {err && <p className="text-sm text-rose-700">{err}</p>}
    </form>
  );
}
```

- [ ] **Step 3: Detail thread**

```tsx
// apps/web/app/(portal)/portal/requests/[id]/page.tsx
"use client";
import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { portalApi } from "@/lib/portal-api";

export default function RequestThread() {
  const params = useParams<{ id: string }>();
  const [r, setR] = useState<any>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => portalApi.requests.detail(params.id).then(setR);
  useEffect(() => { load(); }, [params.id]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try { await portalApi.requests.reply(params.id, body); setBody(""); await load(); }
    finally { setBusy(false); }
  };

  if (!r) return <p>Loading…</p>;
  return (
    <div className="space-y-4">
      <header className="rounded border bg-white p-4">
        <h1 className="text-xl font-semibold">{r.title}</h1>
        <div className="text-sm text-neutral-600">{r.status}</div>
      </header>
      <section className="rounded border bg-white p-4">
        <p className="whitespace-pre-wrap text-sm">{r.body}</p>
      </section>
      <ul className="space-y-3">
        {r.messages.map((m: any) => (
          <li key={m.id} className={`rounded border p-3 text-sm ${m.author.kind === "staff" ? "bg-blue-50" : "bg-white"}`}>
            <div className="text-xs text-neutral-500">{m.author.kind === "staff" ? "Team" : "You"} · {new Date(m.createdAt).toLocaleString()}</div>
            <div className="mt-1 whitespace-pre-wrap">{m.body}</div>
          </li>
        ))}
      </ul>
      {r.status !== "CLOSED" && (
        <form onSubmit={send} className="rounded border bg-white p-3">
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} className="w-full rounded border px-3 py-2 text-sm" placeholder="Reply…" />
          <div className="mt-2 flex justify-end">
            <button disabled={busy} className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50">{busy ? "Sending…" : "Send"}</button>
          </div>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app
git commit -m "feat(web): portal requests pages (list, new, thread)"
```

---

## Phase 5 — Staff-side touches

### Task 5.1: Task `isClientVisible` toggle in editor

**Files:**
- Modify: the staff task editor component (find via `grep -rln "isClientVisible\|TaskForm\|task-detail-drawer" apps/web/components/tasks`)
- Modify: `apps/api/src/modules/tasks/tasks.service.ts` (allow updating `isClientVisible`)

- [ ] **Step 1: Locate staff task form**

Run: `grep -rln "create-task-dialog\|task-detail-drawer" apps/web/components/tasks`

- [ ] **Step 2: Add a checkbox**

In the task edit form (e.g., `task-detail-drawer.tsx`), add a checkbox row:

```tsx
<label className="flex items-center gap-2 text-sm">
  <input type="checkbox" checked={form.isClientVisible ?? false} onChange={(e) => set({ isClientVisible: e.target.checked })} />
  Visible to client
</label>
```

Persist `isClientVisible` through the existing update flow (DTO + service). Update the staff `UpdateTaskDto` to include `isClientVisible?: boolean` and ensure `tasks.service.ts` writes it through.

- [ ] **Step 3: Verify build**

`npm run build --workspace @nuro7/api && npm run build --workspace @nuro7/web`

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/tasks apps/web/components/tasks
git commit -m "feat: staff-side toggle to mark tasks visible to client"
```

### Task 5.2: Portal access panel on Client detail page

**Files:**
- Create: `apps/api/src/modules/clients/portal-contacts.controller.ts`
- Create: `apps/api/src/modules/clients/portal-contacts.service.ts`
- Modify: `apps/api/src/modules/clients/clients.module.ts`
- Create: `apps/web/components/clients/portal-access-panel.tsx`
- Modify: the staff client detail page (find via `grep -rln "clients/\[id\]\|ClientDetail" apps/web/app`)

- [ ] **Step 1: Service**

```typescript
// apps/api/src/modules/clients/portal-contacts.service.ts
import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PortalAuthService } from "../client-portal/auth/portal-auth.service";

@Injectable()
export class PortalContactsService {
  constructor(private readonly prisma: PrismaService, private readonly auth: PortalAuthService) {}

  list(clientId: string) {
    return this.prisma.clientContact.findMany({ where: { clientId }, orderBy: { createdAt: "asc" } });
  }

  async invite(clientId: string, email: string, name: string | null) {
    const lc = email.toLowerCase();
    const contact = await this.prisma.clientContact.upsert({
      where: { clientId_email: { clientId, email: lc } },
      update: { status: "ACTIVE", name },
      create: { clientId, email: lc, name },
    });
    await this.auth.requestLink(lc, null);
    return contact;
  }

  async setStatus(clientId: string, contactId: string, status: "ACTIVE" | "DISABLED") {
    const c = await this.prisma.clientContact.findFirst({ where: { id: contactId, clientId } });
    if (!c) throw new NotFoundException();
    return this.prisma.clientContact.update({ where: { id: contactId }, data: { status } });
  }

  async revokeAllSessions(clientId: string, contactId: string) {
    const c = await this.prisma.clientContact.findFirst({ where: { id: contactId, clientId } });
    if (!c) throw new NotFoundException();
    await this.prisma.clientPortalSession.updateMany({
      where: { contactId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }
}
```

- [ ] **Step 2: Controller (gated by existing client-management role guard)**

```typescript
// apps/api/src/modules/clients/portal-contacts.controller.ts
import { Body, Controller, Delete, Get, Param, Post, Patch, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { IsEmail, IsEnum, IsOptional, IsString } from "class-validator";
import { PortalContactsService } from "./portal-contacts.service";

class InviteDto {
  @IsEmail() email!: string;
  @IsOptional() @IsString() name?: string;
}
class StatusDto {
  @IsEnum(["ACTIVE", "DISABLED"])
  status!: "ACTIVE" | "DISABLED";
}

@Controller("clients/:clientId/portal-contacts")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("SUPER_ADMIN", "ADMIN", "ACCOUNT_MANAGER")
export class PortalContactsController {
  constructor(private readonly svc: PortalContactsService) {}

  @Get() list(@Param("clientId") clientId: string) { return this.svc.list(clientId); }

  @Post() invite(@Param("clientId") clientId: string, @Body() dto: InviteDto) {
    return this.svc.invite(clientId, dto.email, dto.name ?? null);
  }

  @Patch(":id/status")
  setStatus(@Param("clientId") clientId: string, @Param("id") id: string, @Body() dto: StatusDto) {
    return this.svc.setStatus(clientId, id, dto.status);
  }

  @Delete(":id/sessions")
  revoke(@Param("clientId") clientId: string, @Param("id") id: string) {
    return this.svc.revokeAllSessions(clientId, id);
  }
}
```

> Replace `ACCOUNT_MANAGER` with whatever role the codebase uses; remove if not present.

- [ ] **Step 3: Module wiring**

In `apps/api/src/modules/clients/clients.module.ts` add the new controller + service, and import `ClientPortalModule` to access `PortalAuthService`. Re-export `PortalAuthService` from `client-portal.module.ts`.

- [ ] **Step 4: Web panel component + page mount**

`apps/web/components/clients/portal-access-panel.tsx`:

```tsx
"use client";
import { FormEvent, useEffect, useState } from "react";

export function PortalAccessPanel({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  const url = `${base}/api/v1/clients/${clientId}/portal-contacts`;

  const load = async () => {
    const res = await fetch(url, { credentials: "include" });
    if (res.ok) setRows(await res.json());
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clientId]);

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, name: name || undefined }) });
      setEmail(""); setName(""); await load();
    } finally { setBusy(false); }
  };

  const setStatus = async (id: string, status: "ACTIVE" | "DISABLED") => {
    await fetch(`${url}/${id}/status`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    await load();
  };

  const revoke = async (id: string) => {
    await fetch(`${url}/${id}/sessions`, { method: "DELETE", credentials: "include" });
    await load();
  };

  return (
    <section className="rounded border bg-white p-4">
      <h2 className="font-medium">Portal access</h2>
      <form onSubmit={invite} className="mt-2 flex gap-2">
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="email" className="flex-1 rounded border px-2 py-1 text-sm" />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="name (optional)" className="flex-1 rounded border px-2 py-1 text-sm" />
        <button disabled={busy} className="rounded bg-black px-3 py-1 text-sm text-white disabled:opacity-50">Invite</button>
      </form>
      <ul className="mt-3 divide-y">
        {rows.map((c) => (
          <li key={c.id} className="flex items-center justify-between py-2 text-sm">
            <span>{c.email} {c.name ? `· ${c.name}` : ""}</span>
            <span className="flex items-center gap-2">
              <span className="text-neutral-600">{c.status}</span>
              <button onClick={() => setStatus(c.id, c.status === "ACTIVE" ? "DISABLED" : "ACTIVE")} className="rounded border px-2 py-1 text-xs">{c.status === "ACTIVE" ? "Disable" : "Enable"}</button>
              <button onClick={() => revoke(c.id)} className="rounded border px-2 py-1 text-xs">Revoke sessions</button>
            </span>
          </li>
        ))}
        {rows.length === 0 && <li className="py-2 text-sm text-neutral-500">No portal contacts yet.</li>}
      </ul>
    </section>
  );
}
```

Mount it on the staff client detail page (`apps/web/app/(dashboard)/clients/[id]/...`) — drop `<PortalAccessPanel clientId={params.id} />` near the existing client info section.

- [ ] **Step 5: Verify + commit**

```bash
npm run build --workspace @nuro7/api && npm run build --workspace @nuro7/web
git add apps/api/src/modules/clients apps/web/components/clients apps/web/app
git commit -m "feat: staff-side portal access panel for client contacts"
```

### Task 5.3: Staff reply on client requests

**Files:**
- Create: `apps/api/src/modules/clients/staff-requests.controller.ts`
- Create: `apps/api/src/modules/clients/staff-requests.service.ts`
- Modify: `apps/api/src/modules/clients/clients.module.ts`
- Create: `apps/web/components/clients/client-request-thread.tsx`
- Modify: client detail page to mount the thread component

- [ ] **Step 1: Service + controller**

```typescript
// apps/api/src/modules/clients/staff-requests.service.ts
import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class StaffRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  list(clientId: string) {
    return this.prisma.clientRequest.findMany({
      where: { clientId },
      orderBy: { updatedAt: "desc" },
    });
  }

  async detail(id: string) {
    const r = await this.prisma.clientRequest.findUnique({
      where: { id },
      include: { messages: { include: { authorContact: true, authorUser: true }, orderBy: { createdAt: "asc" } } },
    });
    if (!r) throw new NotFoundException();
    return r;
  }

  async reply(id: string, userId: string, body: string) {
    const r = await this.prisma.clientRequest.findUnique({ where: { id } });
    if (!r) throw new NotFoundException();
    await this.prisma.$transaction([
      this.prisma.clientRequestMessage.create({ data: { requestId: id, authorUserId: userId, body } }),
      this.prisma.clientRequest.update({ where: { id }, data: { updatedAt: new Date() } }),
    ]);
    return { ok: true };
  }

  async setStatus(id: string, status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED") {
    const r = await this.prisma.clientRequest.findUnique({ where: { id } });
    if (!r) throw new NotFoundException();
    return this.prisma.clientRequest.update({ where: { id }, data: { status } });
  }

  async linkTask(id: string, taskId: string) {
    const r = await this.prisma.clientRequest.findUnique({ where: { id } });
    if (!r) throw new NotFoundException();
    const t = await this.prisma.task.findFirst({ where: { id: taskId, project: { clientId: r.clientId } } });
    if (!t) throw new ForbiddenException("task_not_in_client");
    return this.prisma.clientRequest.update({ where: { id }, data: { linkedTaskId: taskId } });
  }
}
```

```typescript
// apps/api/src/modules/clients/staff-requests.controller.ts
import { Body, Controller, Get, Param, Patch, Post, UseGuards, Req } from "@nestjs/common";
import { IsEnum, IsString, MinLength } from "class-validator";
import type { Request } from "express";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { StaffRequestsService } from "./staff-requests.service";

class ReplyDto { @IsString() @MinLength(1) body!: string; }
class StatusDto { @IsEnum(["OPEN","IN_PROGRESS","RESOLVED","CLOSED"]) status!: "OPEN"|"IN_PROGRESS"|"RESOLVED"|"CLOSED"; }
class LinkDto { @IsString() taskId!: string; }

@Controller("client-requests")
@UseGuards(JwtAuthGuard)
export class StaffRequestsController {
  constructor(private readonly svc: StaffRequestsService) {}

  @Get() list(@Req() req: any) { return this.svc.list(req.query.clientId as string); }
  @Get(":id") detail(@Param("id") id: string) { return this.svc.detail(id); }
  @Post(":id/messages") reply(@Param("id") id: string, @Body() dto: ReplyDto, @Req() req: any) {
    return this.svc.reply(id, req.user.id, dto.body);
  }
  @Patch(":id/status") setStatus(@Param("id") id: string, @Body() dto: StatusDto) { return this.svc.setStatus(id, dto.status); }
  @Patch(":id/linked-task") linkTask(@Param("id") id: string, @Body() dto: LinkDto) { return this.svc.linkTask(id, dto.taskId); }
}
```

- [ ] **Step 2: Notifications: notify the originating contact on staff reply**

In `StaffRequestsService.reply`, after creating the message, fetch the request's `createdBy.email` and call:
```typescript
await this.mail.sendTemplateEmail(contact.email, "Update on your request", { title: r.title, link: `${env.portalUrl}/portal/requests/${id}` });
```
(Inject `MailService` and `env` accordingly.)

- [ ] **Step 3: Module wiring**

Add controller + service to `clients.module.ts`. Ensure `MailService` is provided.

- [ ] **Step 4: Web — staff thread component**

Create `apps/web/components/clients/client-request-thread.tsx` (mirroring the portal thread UI, plus a status dropdown that calls `PATCH /api/v1/client-requests/:id/status`). Mount it on a `clients/[id]/requests` tab or section.

- [ ] **Step 5: Verify + commit**

```bash
npm run build --workspace @nuro7/api && npm run build --workspace @nuro7/web
git add apps/api/src/modules/clients apps/web
git commit -m "feat: staff-side client request management (reply, status, link task)"
```

### Task 5.4: Activity log entries on portal actions

**Files:**
- Modify: `apps/api/src/modules/client-portal/auth/portal-auth.service.ts`
- Modify: `apps/api/src/modules/client-portal/proposals/portal-proposals.service.ts`
- Modify: `apps/api/src/modules/client-portal/requests/portal-requests.service.ts`

- [ ] **Step 1: Inspect ActivityLog**

Run:
```bash
grep -n "model ActivityLog" -A 20 packages/db/prisma/schema.prisma
ls apps/api/src/modules/activity 2>/dev/null
```
If `ActivityLog` lacks a `meta JSON` field, append one in a follow-up migration. Otherwise stash actorType in `meta`.

- [ ] **Step 2: Wrap state-changing portal calls**

After each successful state change (`verify`, `decide`, `requests.create`, `requests.reply`), insert:
```typescript
await this.prisma.activityLog.create({
  data: {
    action: "PORTAL_PROPOSAL_DECIDED", // or PORTAL_LOGIN, PORTAL_REQUEST_CREATED, PORTAL_REQUEST_REPLIED
    targetType: "Proposal",
    targetId: proposalId,
    meta: { actorType: "CLIENT_CONTACT", actorId: contactId, decision: dto.decision },
  } as any,
});
```
Adjust to the actual `ActivityLog` columns the codebase uses.

- [ ] **Step 3: Verify + commit**

```bash
npm run build --workspace @nuro7/api
git add apps/api/src/modules/client-portal
git commit -m "feat(api): activity log for portal actions"
```

---

## Phase 6 — Tests + feature flag + docs

### Task 6.1: Add Jest to `apps/api`

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/jest.config.cjs`
- Create: `apps/api/test/setup.ts`

- [ ] **Step 1: Add deps**

```bash
npm install --workspace @nuro7/api -D jest @types/jest ts-jest supertest @types/supertest
```

- [ ] **Step 2: Jest config**

```js
// apps/api/jest.config.cjs
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["<rootDir>/src/**/*.spec.ts", "<rootDir>/test/**/*.spec.ts"],
  setupFilesAfterEnv: ["<rootDir>/test/setup.ts"],
};
```

- [ ] **Step 3: Setup file**

```typescript
// apps/api/test/setup.ts
import "reflect-metadata";
process.env.NODE_ENV = "test";
process.env.PORTAL_ENABLED = "true";
process.env.PORTAL_URL = "http://localhost:3000";
```

- [ ] **Step 4: Add npm script**

In `apps/api/package.json`:
```json
"test": "jest",
"test:watch": "jest --watch"
```

- [ ] **Step 5: Smoke test**

Create `apps/api/src/modules/client-portal/token.util.spec.ts`:

```typescript
import { generateToken, sha256, safeEqualHex } from "./token.util";

describe("token util", () => {
  it("generates 43+ char base64url tokens with matching sha256 hash", () => {
    const { raw, hash } = generateToken();
    expect(raw.length).toBeGreaterThanOrEqual(43);
    expect(hash).toBe(sha256(raw));
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("safeEqualHex returns false for different lengths", () => {
    expect(safeEqualHex("ab", "abcd")).toBe(false);
  });

  it("safeEqualHex returns true for equal strings", () => {
    const h = sha256("hello");
    expect(safeEqualHex(h, h)).toBe(true);
  });
});
```

Run:
```bash
npm test --workspace @nuro7/api
```
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add apps/api/package.json apps/api/jest.config.cjs apps/api/test apps/api/src/modules/client-portal/token.util.spec.ts package-lock.json
git commit -m "test(api): add jest + token util spec"
```

### Task 6.2: Auth spec

**Files:**
- Create: `apps/api/test/client-portal/auth.spec.ts`

- [ ] **Step 1: Write spec**

```typescript
// apps/api/test/client-portal/auth.spec.ts
import { Test } from "@nestjs/testing";
import { PrismaService } from "../../src/common/prisma/prisma.service";
import { MailService } from "../../src/common/mail/mail.service";
import { PortalAuthService } from "../../src/modules/client-portal/auth/portal-auth.service";
import { sha256 } from "../../src/modules/client-portal/token.util";

describe("PortalAuthService", () => {
  let svc: PortalAuthService;
  const prismaMock: any = {
    clientContact: { findFirst: jest.fn() },
    clientMagicLink: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    clientPortalSession: { create: jest.fn(), updateMany: jest.fn() },
  };
  const mailMock: any = { sendTemplateEmail: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        PortalAuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: MailService, useValue: mailMock },
      ],
    }).compile();
    svc = mod.get(PortalAuthService);
  });

  it("requestLink does nothing when contact missing (no enumeration)", async () => {
    prismaMock.clientContact.findFirst.mockResolvedValue(null);
    await svc.requestLink("nobody@example.com", "127.0.0.1");
    expect(prismaMock.clientMagicLink.create).not.toHaveBeenCalled();
    expect(mailMock.sendTemplateEmail).not.toHaveBeenCalled();
  });

  it("requestLink stores hashed token and sends email when contact exists", async () => {
    prismaMock.clientContact.findFirst.mockResolvedValue({ id: "c1", email: "a@b.com", name: "A" });
    await svc.requestLink("a@b.com", "127.0.0.1");
    const args = prismaMock.clientMagicLink.create.mock.calls[0][0].data;
    expect(args.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(mailMock.sendTemplateEmail).toHaveBeenCalled();
  });

  it("verify rejects expired link", async () => {
    prismaMock.clientMagicLink.findUnique.mockResolvedValue({
      id: "l1", contactId: "c1", tokenHash: sha256("x"), expiresAt: new Date(Date.now() - 1000), usedAt: null,
    });
    await expect(svc.verify("x", null, null)).rejects.toThrow();
  });

  it("verify consumes link single-use", async () => {
    prismaMock.clientMagicLink.findUnique.mockResolvedValue({
      id: "l1", contactId: "c1", tokenHash: sha256("y"), expiresAt: new Date(Date.now() + 60_000), usedAt: null,
    });
    prismaMock.clientMagicLink.update.mockResolvedValue({});
    prismaMock.clientPortalSession.create.mockResolvedValue({});
    await svc.verify("y", null, null);
    expect(prismaMock.clientMagicLink.update).toHaveBeenCalledWith({
      where: { id: "l1" },
      data: { usedAt: expect.any(Date) },
    });
    expect(prismaMock.clientPortalSession.create).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run + commit**

```bash
npm test --workspace @nuro7/api
git add apps/api/test/client-portal/auth.spec.ts
git commit -m "test(api): portal auth service unit tests"
```

### Task 6.3: Isolation spec

**Files:**
- Create: `apps/api/test/client-portal/isolation.spec.ts`

- [ ] **Step 1: Write spec**

```typescript
// apps/api/test/client-portal/isolation.spec.ts
import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../src/common/prisma/prisma.service";
import { PortalProjectsService } from "../../src/modules/client-portal/projects/portal-projects.service";

describe("Portal projects isolation", () => {
  let svc: PortalProjectsService;
  const prismaMock: any = {
    project: { findMany: jest.fn(), findFirst: jest.fn() },
    task: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [PortalProjectsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    svc = mod.get(PortalProjectsService);
  });

  it("list filters by clientId", async () => {
    prismaMock.project.findMany.mockResolvedValue([]);
    await svc.list("client-A");
    expect(prismaMock.project.findMany.mock.calls[0][0].where).toEqual({ clientId: "client-A" });
  });

  it("detail throws NotFound on cross-client id", async () => {
    prismaMock.project.findFirst.mockResolvedValue(null);
    await expect(svc.detail("client-A", "project-of-B")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("tasks filter to isClientVisible only and check project ownership", async () => {
    prismaMock.project.findFirst.mockResolvedValue({ id: "p1", clientId: "client-A" });
    prismaMock.task.findMany.mockResolvedValue([]);
    await svc.tasks("client-A", "p1");
    expect(prismaMock.task.findMany.mock.calls[0][0].where).toEqual({
      projectId: "p1",
      isClientVisible: true,
    });
  });

  it("tasks NotFound when project belongs to a different client", async () => {
    prismaMock.project.findFirst.mockResolvedValue(null);
    await expect(svc.tasks("client-A", "project-of-B")).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 2: Run + commit**

```bash
npm test --workspace @nuro7/api
git add apps/api/test/client-portal/isolation.spec.ts
git commit -m "test(api): portal isolation tests"
```

### Task 6.4: Feature flag enforcement

**Files:**
- Modify: `apps/api/src/main.ts`
- Modify: `apps/web/middleware.ts`

- [ ] **Step 1: API short-circuit when off**

Add before the listen call in `main.ts`:

```typescript
import { NotFoundException, RequestMethod } from "@nestjs/common";
// ...
if (!env.portalEnabled) {
  app.use("/api/v1/client-portal", (_req, _res, next) => next(new NotFoundException()));
}
```

- [ ] **Step 2: Web short-circuit**

In `apps/web/middleware.ts`, near the top of the function:

```typescript
if (process.env.NEXT_PUBLIC_PORTAL_ENABLED !== "true" && pathname.startsWith("/portal")) {
  return new NextResponse(null, { status: 404 });
}
```

Document `NEXT_PUBLIC_PORTAL_ENABLED` and `PORTAL_ENABLED` in `README.md`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/main.ts apps/web/middleware.ts README.md
git commit -m "feat: PORTAL_ENABLED feature flag"
```

### Task 6.5: Manual QA checklist

**Files:**
- Create: `docs/superpowers/specs/2026-05-07-client-portal-qa.md`

- [ ] **Step 1: Write checklist**

```markdown
# Client Portal — Manual QA Checklist

Run with `PORTAL_ENABLED=true` and `NEXT_PUBLIC_PORTAL_ENABLED=true`.

## Auth
- [ ] Unknown email → "Check your inbox" message; no email actually sent (verify in mail logs).
- [ ] Known active contact → email arrives with link; clicking sets `cp_session` cookie and lands on `/portal`.
- [ ] Expired link (wait >15 min or set TTL=1) → redirect to `/portal/login?e=invalid`.
- [ ] Used link reused → same neutral error.
- [ ] Disabled contact → after disable in staff UI, refresh portal page returns 401 → redirect to login.
- [ ] Logout → `cp_session` cleared, redirected to login.

## Navigation
- [ ] All top-bar links work; mobile width 375px renders without horizontal scroll.
- [ ] Direct visit to `/portal/projects/<id-of-other-client>` returns 404 (UI shows "Loading…" then error).

## Projects
- [ ] Project list shows only projects belonging to logged-in client.
- [ ] Project detail tabs switch; Tasks tab shows only `isClientVisible=true` tasks.

## Invoices
- [ ] Invoice list excludes DRAFT.
- [ ] PDF download streams correct invoice; cross-client URL → 404.

## Proposals
- [ ] DRAFT proposals not listed.
- [ ] Accept then revisit → "Decision recorded …".
- [ ] Re-decide → 409.

## Requests
- [ ] Submit new request with no project → appears in list.
- [ ] Reply → message appears; staff side gets notification.
- [ ] Status filter narrows list correctly.

## Feature flag
- [ ] With `PORTAL_ENABLED=false`, `/portal` returns 404 and `/api/v1/client-portal/*` returns 404.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-05-07-client-portal-qa.md
git commit -m "docs: portal manual QA checklist"
```

### Task 6.6: Final wire-up + smoke

**Files:** none (verify only)

- [ ] **Step 1: Type-check + build**

```bash
npx tsc -p apps/api/tsconfig.json --noEmit
npx tsc -p apps/web/tsconfig.json --noEmit
npm run build --workspace @nuro7/api
npm run build --workspace @nuro7/web
```
Expected: all clean.

- [ ] **Step 2: Run all tests**

```bash
npm test --workspace @nuro7/api
```
Expected: all green.

- [ ] **Step 3: Run the manual QA checklist** in `docs/superpowers/specs/2026-05-07-client-portal-qa.md`. Tick items as you go.

- [ ] **Step 4: Open PR**

```bash
git push -u origin feat/client-portal
gh pr create --title "feat: client portal v1 (magic-link, projects, invoices, proposals, requests)" --body "$(cat <<'EOF'
## Summary
- Magic-link auth with separate ClientContact + ClientPortalSession
- /portal route group: dashboard, projects, invoices, proposals, requests
- Per-client isolation enforced in services + whitelist serializers
- Feature-flagged with PORTAL_ENABLED

## Spec
docs/superpowers/specs/2026-05-07-client-portal-design.md

## Test plan
- [ ] npm test --workspace @nuro7/api
- [ ] Manual QA checklist in docs/superpowers/specs/2026-05-07-client-portal-qa.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review notes (informational)

- Spec coverage: §1 goal, §2 approach, §3 auth, §4 data model (Tasks 1.1, 2.4, 2.5, 5.x), §5 routing/UI (Phase 4), §6 API surface (Phase 3), §7 isolation (3.1 serializers + 3.2/3.3/3.4/3.5 service-level filters + 6.3 tests), §8 staff touches (Phase 5), §9 errors/tests/rollout (6.1–6.5), §10 out-of-scope confirmed not implemented.
- Type names match between tasks: `PortalContext`, `ClientPortalGuard`, `PORTAL_COOKIE`, `serialize*` family.
- Placeholders called out (`renderPdf`, `OrganizationSettings` model name, project-manager FK, `ProjectStatus`/`InvoiceStatus` enum values, `ACCOUNT_MANAGER` role, `ActivityLog` shape) are explicitly flagged for the implementer to verify before running, not silent TBDs.
