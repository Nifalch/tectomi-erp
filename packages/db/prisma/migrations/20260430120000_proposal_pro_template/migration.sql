-- Pro-grade proposal template fields + Deliverables/Exclusions table

-- 1. Extend Proposal with extra narrative fields
ALTER TABLE "Proposal"
  ADD COLUMN "projectUnderstanding" TEXT,
  ADD COLUMN "paymentTermsText"     TEXT,
  ADD COLUMN "validUntil"           DATE;

-- 2. About-us narrative on org settings (single source for all proposals)
ALTER TABLE "OrganizationSettings"
  ADD COLUMN "aboutCompany" TEXT;

-- 3. Deliverables & Exclusions
CREATE TYPE "DeliverableKind" AS ENUM ('INCLUDED', 'EXCLUDED');

CREATE TABLE "ProposalDeliverable" (
  "id"          TEXT NOT NULL,
  "proposalId"  TEXT NOT NULL,
  "kind"        "DeliverableKind" NOT NULL,
  "title"       TEXT NOT NULL,
  "description" TEXT,
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProposalDeliverable_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProposalDeliverable_proposalId_idx" ON "ProposalDeliverable"("proposalId");

ALTER TABLE "ProposalDeliverable"
  ADD CONSTRAINT "ProposalDeliverable_proposalId_fkey"
  FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
