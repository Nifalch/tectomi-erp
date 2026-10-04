-- Add projectId (optional FK) and discountAmount to Bill
ALTER TABLE "Bill"
  ADD COLUMN "projectId" TEXT,
  ADD COLUMN "discountAmount" DECIMAL(14, 2) NOT NULL DEFAULT 0;

CREATE INDEX "Bill_projectId_idx" ON "Bill"("projectId");

ALTER TABLE "Bill"
  ADD CONSTRAINT "Bill_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
