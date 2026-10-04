# Nuro7 Architecture

## Monorepo layout

- `apps/api`: NestJS REST API with modular domain services, JWT auth, RBAC guards, Swagger docs, and WebSocket notifications.
- `apps/web`: Next.js App Router dashboard using Tailwind, TanStack Query, Zustand, and shadcn-style UI primitives.
- `packages/db`: Prisma schema for PostgreSQL plus seed data covering roles, permissions, clients, projects, HR, finance, invoices, proposals, and documents.
- `packages/contracts`: Shared role, navigation, and API contract metadata.

## Backend modules

- `auth`: login, registration, refresh tokens, password reset, email verification, session model
- `users`, `roles`: user administration and RBAC lookup
- `clients`, `projects`, `tasks`: delivery operations
- `time`, `attendance`, `leave`, `hr`: employee operations
- `finance`, `invoices`, `proposals`: commercial operations
- `resources`, `documents`, `notifications`, `reports`, `dashboard`: supporting platform services

## Data model highlights

- Full RBAC is modeled with `Role`, `Permission`, `UserRole`, and `RolePermission`.
- Core delivery relationships connect `Client -> Project -> Task/TimeEntry/Invoice/Document`.
- HR data is isolated around `EmployeeProfile`, `Attendance`, `LeaveRequest`, `LeaveBalance`, and promotion/document history.
- Finance tracks `Expense`, `Revenue`, `Transaction`, `Invoice`, and `InvoiceItem`.
- The platform is ready for future AI analytics and integration modules without changing the base entity graph.

## API surface

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/register`
- `GET /api/v1/dashboard/summary`
- `GET /api/v1/clients`
- `GET /api/v1/projects`
- `GET /api/v1/tasks`
- `GET /api/v1/attendance`
- `GET /api/v1/leave`
- `GET /api/v1/finance/summary`
- `GET /api/v1/invoices`
- `GET /api/v1/reports/profitability`

Swagger is exposed from the Nest app at `/api/docs`.
