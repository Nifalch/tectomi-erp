# Tectomi ERP

Tectomi ERP is a modular internal management platform for IT, software, and AI delivery teams. The repository is structured as a monorepo with:

- `apps/web`: Next.js App Router frontend
- `apps/api`: NestJS REST API and WebSocket notifications
- `packages/db`: Prisma schema and seed scripts for PostgreSQL
- `packages/contracts`: shared platform types, RBAC maps, and dashboard metadata

## Modules

- Authentication and RBAC
- Clients and contracts
- Projects, milestones, and resource allocation
- Tasks and time tracking
- Attendance and leave
- HR and employee performance
- Finance, accounting, and invoices
- Proposal builder
- Document management
- Notifications and reporting

## Quick start

1. Copy `.env.example` to `.env` and adjust secrets.
2. Install dependencies with `npm install`.
3. Generate the Prisma client with `npm run db:generate`.
4. Run migrations with `npm run db:migrate`.
5. Seed demo data with `npm run db:seed`.
6. Start the apps:
   - `npm run dev:web`
   - `npm run dev:api`

## Architecture notes

- PostgreSQL + Prisma model the full ERP domain.
- NestJS modules isolate business capabilities and enforce RBAC with guards and decorators.
- The web app uses App Router, Tailwind CSS, shadcn-style primitives, TanStack Query, and Zustand.
- Storage is abstracted so local disk can be swapped for S3.
- The platform is prepared for AI analytics, external integrations, and client portal extensions.

# Tectomi ERP
