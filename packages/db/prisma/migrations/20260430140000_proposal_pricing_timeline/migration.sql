-- Per-feature pricing on deliverables + duration on scope blocks for timeline visualization
ALTER TABLE "ProposalDeliverable" ADD COLUMN "amount" DECIMAL(12, 2);
ALTER TABLE "ProposalBlock"       ADD COLUMN "durationWeeks" INTEGER;
