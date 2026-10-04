-- ProjectPaymentMilestone — track 50/30/20-style payment schedules per project
-- (Note: a different MilestoneStatus enum already exists for the Milestone planning model.
-- We use PaymentMilestoneStatus here to avoid the collision.)
CREATE TYPE "PaymentMilestoneStatus" AS ENUM ('PENDING', 'INVOICED', 'PAID', 'SKIPPED');

CREATE TABLE "ProjectPaymentMilestone" (
  "id"          TEXT NOT NULL,
  "projectId"   TEXT NOT NULL,
  "label"       TEXT NOT NULL,
  "percentage"  DECIMAL(6, 2) NOT NULL,
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  "status"      "PaymentMilestoneStatus" NOT NULL DEFAULT 'PENDING',
  "invoiceId"   TEXT,
  "dueDate"     DATE,
  "notes"       TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectPaymentMilestone_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectPaymentMilestone_invoiceId_key" ON "ProjectPaymentMilestone"("invoiceId");
CREATE INDEX "ProjectPaymentMilestone_projectId_idx" ON "ProjectPaymentMilestone"("projectId");
CREATE INDEX "ProjectPaymentMilestone_status_idx" ON "ProjectPaymentMilestone"("status");

ALTER TABLE "ProjectPaymentMilestone"
  ADD CONSTRAINT "ProjectPaymentMilestone_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectPaymentMilestone"
  ADD CONSTRAINT "ProjectPaymentMilestone_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: every existing project gets 50/30/20 milestones in PENDING state
INSERT INTO "ProjectPaymentMilestone" ("id", "projectId", "label", "percentage", "sortOrder", "status", "createdAt", "updatedAt")
SELECT
  -- cuid-like id; just ensure uniqueness
  CONCAT(p."id", '_m1'),
  p."id",
  'Advance',
  50.00,
  0,
  'PENDING',
  NOW(),
  NOW()
FROM "Project" p
ON CONFLICT DO NOTHING;

INSERT INTO "ProjectPaymentMilestone" ("id", "projectId", "label", "percentage", "sortOrder", "status", "createdAt", "updatedAt")
SELECT CONCAT(p."id", '_m2'), p."id", 'Mid-project', 30.00, 1, 'PENDING', NOW(), NOW()
FROM "Project" p
ON CONFLICT DO NOTHING;

INSERT INTO "ProjectPaymentMilestone" ("id", "projectId", "label", "percentage", "sortOrder", "status", "createdAt", "updatedAt")
SELECT CONCAT(p."id", '_m3'), p."id", 'Final', 20.00, 2, 'PENDING', NOW(), NOW()
FROM "Project" p
ON CONFLICT DO NOTHING;
