# Client Portal — Design Spec

Date: 2026-05-07
Status: Approved (sections 1–5)
Scope: v1 client-facing portal for a small software-services company

## 1. Goal

Give a client's named contacts a self-service view of their work and money:

- See their projects (status, milestones, % complete, due dates).
- See only the tasks staff have explicitly marked as client-visible.
- See their invoices with PDF download and paid/unpaid status.
- View a sent proposal and Accept or Reject it.
- File a support / change request and have a threaded conversation with the team.

Everything else — online payment, file deliverables, announcements, per-contact roles, 2FA, white-label — is out of scope for v1 and called out explicitly in §10.

## 2. Approach

**Approach A: separate `ClientContact` table + dedicated `ClientPortalSession` + dedicated guard.**

Rejected alternatives:
- Reusing the existing `User` table with a `CLIENT_CONTACT` role. Cheaper to build, but every existing staff controller becomes a place a cross-client leak can happen. Wrong tradeoff for a system that holds finance and HR data.
- Same `User` table with a parallel set of portal controllers that re-implement read paths. Avoids the role-leak problem but duplicates business logic and drifts.

Approach A keeps the staff JWT auth path completely untouched and makes "did this query come from a portal user?" a type-level, not a runtime, distinction.

## 3. Authentication

Magic-link only. No passwords in v1.

Flow:

1. Contact enters email at `/portal/login`.
2. Server creates a `ClientMagicLink` row (raw token = 32-byte base64url, **stored as sha256 hash**), 15-minute TTL, single-use. Always returns 200 (no enumeration).
3. Email delivered with link to `/portal/auth/verify?token=…`.
4. On verify: hash, look up unused/unexpired link, mark `usedAt`, create `ClientPortalSession` (raw cookie value = 32-byte base64url, stored as sha256 hash), set `cp_session` cookie (`HttpOnly`, `Secure`, `SameSite=Lax`, path `/`, 30-day sliding expiry), redirect to `/portal`.
5. Logout revokes the current session and clears the cookie.

Throttling (via existing `@nestjs/throttler`):
- Magic-link requests: 5/hour per email, 20/hour per IP.
- Session-bearing endpoints: existing app-wide defaults plus per-endpoint caps in §6.

Token comparisons use timing-safe equality on hashes. Plaintext tokens never persist.

## 4. Data model

New Prisma models in `packages/db/prisma/schema.prisma`:

```prisma
model ClientContact {
  id        String   @id @default(cuid())
  clientId  String
  client    Client   @relation(fields: [clientId], references: [id], onDelete: Cascade)
  email     String
  name      String?
  status    ClientContactStatus @default(ACTIVE)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  magicLinks          ClientMagicLink[]
  sessions            ClientPortalSession[]
  requests            ClientRequest[]
  messages            ClientRequestMessage[]
  proposalAcceptances ProposalAcceptance[]

  @@unique([clientId, email])
  @@index([email])
}

model ClientMagicLink {
  id        String   @id @default(cuid())
  contactId String
  contact   ClientContact @relation(fields: [contactId], references: [id], onDelete: Cascade)
  tokenHash String   @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime @default(now())
  ip        String?
  @@index([contactId])
}

model ClientPortalSession {
  id         String   @id @default(cuid())
  contactId  String
  contact    ClientContact @relation(fields: [contactId], references: [id], onDelete: Cascade)
  tokenHash  String   @unique
  expiresAt  DateTime
  revokedAt  DateTime?
  lastSeenAt DateTime @default(now())
  userAgent  String?
  ip         String?
  @@index([contactId])
}

model ClientRequest {
  id           String   @id @default(cuid())
  clientId     String
  client       Client   @relation(fields: [clientId], references: [id])
  projectId    String?
  project      Project? @relation(fields: [projectId], references: [id])
  createdById  String
  createdBy    ClientContact @relation(fields: [createdById], references: [id])
  title        String
  body         String
  status       ClientRequestStatus @default(OPEN)
  linkedTaskId String?
  linkedTask   Task?    @relation(fields: [linkedTaskId], references: [id])
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  messages     ClientRequestMessage[]
  @@index([clientId, status])
}

model ClientRequestMessage {
  id              String   @id @default(cuid())
  requestId       String
  request         ClientRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
  authorContactId String?
  authorContact   ClientContact? @relation(fields: [authorContactId], references: [id])
  authorUserId    String?
  authorUser      User?         @relation(fields: [authorUserId], references: [id])
  body            String
  createdAt       DateTime @default(now())
  @@index([requestId, createdAt])
}

model ProposalAcceptance {
  id         String   @id @default(cuid())
  proposalId String   @unique
  proposal   Proposal @relation(fields: [proposalId], references: [id])
  contactId  String
  contact    ClientContact @relation(fields: [contactId], references: [id])
  decision   AcceptanceDecision
  note       String?
  ip         String
  userAgent  String
  decidedAt  DateTime @default(now())
}

enum ClientContactStatus { ACTIVE  DISABLED }
enum ClientRequestStatus { OPEN  IN_PROGRESS  RESOLVED  CLOSED }
enum AcceptanceDecision  { ACCEPTED  REJECTED }
```

Touches to existing models:
- `Task` — add `isClientVisible Boolean @default(false)` plus back-relation to `ClientRequest`.
- `Proposal`, `Client`, `Project` — back-relations to the new models.
- `User` — back-relation to `ClientRequestMessage`.

`ClientRequestMessage` enforces "exactly one author type" by a CHECK constraint added in the migration:
```sql
ALTER TABLE "ClientRequestMessage"
  ADD CONSTRAINT "client_request_message_author_xor"
  CHECK (("authorContactId" IS NOT NULL)::int + ("authorUserId" IS NOT NULL)::int = 1);
```

## 5. Routing & UI

Next.js route group `apps/web/app/(portal)/`. Independent of `(dashboard)`; no internal sidebar.

```
apps/web/app/(portal)/portal/
├── layout.tsx
├── login/page.tsx
├── auth/verify/page.tsx
├── page.tsx                     # dashboard
├── projects/page.tsx
├── projects/[id]/page.tsx
├── invoices/page.tsx
├── invoices/[id]/page.tsx
├── proposals/page.tsx
├── proposals/[id]/page.tsx
├── requests/page.tsx
├── requests/new/page.tsx
└── requests/[id]/page.tsx
```

Middleware (`apps/web/middleware.ts`): for `/portal/:path*`, redirect to `/portal/login` when `cp_session` cookie absent (excluding `/portal/login` and `/portal/auth/verify`). Independent of staff session check.

Page contents (lean):
- **Dashboard**: three cards (active projects, outstanding balance, open requests) + latest 5 invoices + latest 5 requests.
- **Project list**: name, status, % complete, next milestone, due date.
- **Project detail**: header (status, dates, %, milestones) + tabs Tasks (only `isClientVisible=true`; no assignees, no internal comments) and Milestones.
- **Invoice list/detail**: list with status + PDF download; detail reuses the existing print template.
- **Proposal list/detail**: only `SENT/ACCEPTED/REJECTED`; on `SENT`, Accept / Reject with optional note.
- **Requests list/new/detail**: list with status filter; new with title/body/optional project; detail is a thread + reply textarea.

Visual: reuse shadcn primitives. Top bar = org logo + contact name + logout. Mobile-first. No chat widget, no notifications bell, no command palette.

## 6. API surface

All under `/api/client-portal/*`, gated by `ClientPortalGuard`. Every query joins through `req.portal.clientId`.

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/request-link` | `{ email }` → 200 always. 5/h per email, 20/h per IP. |
| GET  | `/auth/verify` | `?token=…`; sets `cp_session`; redirects to `/portal`. |
| POST | `/auth/logout` | Revoke session, clear cookie. |
| GET  | `/me` | `{ contactId, clientId, name, email, orgName, orgLogoUrl }`. |
| GET  | `/dashboard` | Aggregated counts + 5 recent invoices/requests. |
| GET  | `/projects` | Filtered by `clientId`. |
| GET  | `/projects/:id` | 404 on mismatch. |
| GET  | `/projects/:id/tasks` | Only `isClientVisible=true`. |
| GET  | `/invoices` | Excludes DRAFT. |
| GET  | `/invoices/:id` | 404 on mismatch. |
| GET  | `/invoices/:id/pdf` | Streams PDF; same isolation check. |
| GET  | `/proposals` | Excludes DRAFT. |
| GET  | `/proposals/:id` | 404 on mismatch or DRAFT. |
| POST | `/proposals/:id/decide` | `{ decision, note? }`. Only on `SENT`. Idempotent (409 if already decided). 10/h per contact. |
| GET  | `/requests?status=` | List for this client. |
| GET  | `/requests/:id` | Includes messages. |
| POST | `/requests` | `{ title, body, projectId? }`. `projectId` validated to belong to this client. 30/h per contact. |
| POST | `/requests/:id/messages` | `{ body }`. 120/h per contact. |

## 7. Isolation enforcement

Defense layered, not just controllers:

1. Every portal service method takes `clientId` as a required argument and uses it as a `where` filter — not a post-hoc check.
2. Central `assertOwnedByClient(entity, clientId)` throws **404** (not 403) on mismatch — no existence leak.
3. Whitelist serializers (`serializeProject`, `serializeTask`, `serializeInvoice`, …) decide what fields ship. Internal fields (cost, margin, internal notes, assignees, time entries) are never reachable from a portal response.
4. Portal services never accept a Prisma `include`/`select` from the request body or query.

`ClientPortalGuard` (Nest):
- Reads `cp_session` cookie → sha256 → looks up session row.
- Rejects (401) if missing, revoked, expired, or contact `status != ACTIVE`.
- Updates `lastSeenAt`; refreshes `expiresAt` to slide the 30-day window.
- Attaches `req.portal = { contactId, clientId }`.

## 8. Staff-side touches

- Client detail page: "Portal access" panel — list `ClientContact` rows; Invite (creates contact + sends link); enable/disable; "Revoke all sessions". Gated to existing client-management roles.
- Task editor: "Visible to client" toggle that writes `isClientVisible`.
- Notifications: on portal-side `ClientRequest` or `ClientRequestMessage` creation, fan out an in-app notification to the project's PM (or account manager / admin if no project linked). Reuses the existing `Notification` system. Same for staff replies → contact (in-app + email).
- Audit: every state-changing portal call writes an `ActivityLog` entry with `actorType="CLIENT_CONTACT"` (add nullable `actorType` enum field to `ActivityLog` if missing; otherwise stash in `meta` JSON).

## 9. Error handling, testing, rollout

**Errors**
- 404 on any cross-client access (no 403).
- 401 from guard → JSON `{ error: "unauthenticated" }`; web middleware converts page 401s into redirect to `/portal/login`.
- Magic-link verify failures (expired, used, unknown) all render the same neutral "Link is invalid or expired" page.
- Prisma `P2025` → 404. `P2002` → 409 (e.g., re-decide proposal).

**Tests** (introduce Jest in `apps/api`)
- `client-portal/auth.spec.ts`: rate-limit, token hashing, single-use, expiry, cookie issuance, logout revocation.
- `client-portal/isolation.spec.ts`: two-client fixtures; every read endpoint returns 404 for cross-client ids; serializers don't leak internal fields.
- One supertest e2e: invite contact → consume magic link → list projects → list invoices → submit request → reply.
- Manual QA checklist (kept in `docs/`): login on mobile + desktop, PDF download, proposal accept/reject, contact disabled mid-session.

**Migration & rollout**
- Single Prisma migration adds the new tables + `Task.isClientVisible` (default `false` — existing tasks are hidden, safe).
- Feature flag: `PORTAL_ENABLED` env var. Middleware short-circuits `/portal/*` to 404 when off. Ships dark; turn on per-environment.
- No data backfill required.

## 10. Out of scope (explicitly deferred)

- Online payment / Stripe Checkout.
- Shared file deliverables area.
- Announcements / project-update feed.
- Per-contact permissions (all contacts of a client see the same data in v1).
- 2FA on portal (magic link is the factor; revisit later).
- White-label or `portal.<customer>.com` subdomain (v2).
- Public knowledge base.

## 11. Open questions

None outstanding from §1–5. If anything surfaces during planning, it will be resolved in the implementation plan, not silently.
