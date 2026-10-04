-- Bank details + stamp for the invoice template
ALTER TABLE "OrganizationSettings"
  ADD COLUMN "bankName" TEXT,
  ADD COLUMN "bankAccountNumber" TEXT,
  ADD COLUMN "bankAccountHolder" TEXT,
  ADD COLUMN "bankBranch" TEXT,
  ADD COLUMN "bankIfsc" TEXT,
  ADD COLUMN "bankUpi" TEXT,
  ADD COLUMN "stampUrl" TEXT;

-- Optional advance amount on each invoice
ALTER TABLE "Invoice"
  ADD COLUMN "advanceAmount" DECIMAL(12, 2);
