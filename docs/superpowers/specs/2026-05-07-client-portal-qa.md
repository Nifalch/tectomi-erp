# Client Portal — Manual QA Checklist

Run with `PORTAL_ENABLED=true` (API) and `NEXT_PUBLIC_PORTAL_ENABLED=true` (web). Set `CORS_ORIGIN=http://localhost:3000` (or your web origin) on the API.

## Auth

- [ ] Unknown email → "Check your inbox" message; no email actually sent (verify in API mail logs).
- [ ] Known active contact → email arrives with link; clicking the link sets `cp_session` cookie and lands on `/portal`.
- [ ] Expired link (TTL=1 minute for testing or wait >15 min) → redirect to `/portal/login?e=invalid`.
- [ ] Used link reused → same neutral "Link is invalid or expired" error.
- [ ] Disabled contact → after Disable in the staff Portal Access panel, refreshing any `/portal/*` page returns 401 → redirect to login.
- [ ] Logout → `cp_session` cleared, redirected to login.
- [ ] Revoke sessions (staff side) → user is signed out within one request.

## Rate limits

- [ ] 6th magic-link request for the same email within an hour returns 429.
- [ ] 31st new request creation within an hour returns 429.
- [ ] 11th proposal decision attempt within an hour returns 429.

## Navigation

- [ ] All top-bar links work; mobile viewport (375px) renders without horizontal scroll.
- [ ] Direct visit to `/portal/projects/<id-of-other-client>` returns 404 from the API; the UI either shows "Loading…" then an error or renders empty — never another client's data.

## Projects

- [ ] Project list shows only projects belonging to the logged-in client.
- [ ] Project detail tabs switch between Tasks and Milestones.
- [ ] Tasks tab only shows tasks with `isClientVisible=true`.
- [ ] Toggling "Visible to client portal" off in the staff drawer makes the task disappear from the portal on next refresh.

## Invoices

- [ ] Invoice list excludes DRAFT invoices.
- [ ] PDF download streams the correct invoice; cross-client URL `/portal/invoices/<id-of-other-client>/pdf` returns 404.
- [ ] Dashboard "Outstanding balance" matches the sum of SENT + OVERDUE invoices.

## Proposals

- [ ] DRAFT proposals are NOT listed.
- [ ] Accept → status flips, "Decision recorded …" message replaces the Accept/Reject buttons.
- [ ] Reject → same with REJECTED.
- [ ] Re-decide → 409 (Accept/Reject section is hidden after a decision is recorded, so this is mainly a defense-in-depth API test via curl).

## Requests

- [ ] Submit new request with no project → appears in the staff side under the client's "Requests" tab and triggers an in-app notification for admins.
- [ ] Submit new request scoped to a project → notification goes to the project manager.
- [ ] Reply on portal → appears in the staff thread; status flips OPEN → IN_PROGRESS on staff reply.
- [ ] Staff reply → email is queued to the originating contact's email.
- [ ] Status filter narrows the portal list correctly.
- [ ] Submit a request with a `projectId` belonging to a different client (via curl/devtools) → 400 `invalid_project`.

## Feature flag

- [ ] With API `PORTAL_ENABLED=false`: `GET /api/v1/client-portal/me` returns 404.
- [ ] With web `NEXT_PUBLIC_PORTAL_ENABLED!=true`: navigating to `/portal` returns 404.
- [ ] Toggling both to `true` restores normal behavior.

## Cookie / cross-origin

- [ ] Same-origin dev (e.g., behind nginx at `apps/web/nginx`): login flow works end-to-end.
- [ ] Cross-port dev (web:3000, api:4000): the magic-link email links to the API host's verify; after redirect, the `cp_session` cookie is set on the API origin and subsequent portal API requests include it (verify in DevTools → Network → Request Cookies).
