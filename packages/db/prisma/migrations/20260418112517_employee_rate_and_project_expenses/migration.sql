-- CreateEnum
CREATE TYPE "ProjectExpenseCategory" AS ENUM ('SUBSCRIPTION', 'RENT', 'UTILITY', 'TRAVEL', 'SOFTWARE', 'EQUIPMENT', 'HOSTING', 'MARKETING', 'CONTRACTOR', 'OTHER');

-- AlterTable
ALTER TABLE "EmployeeProfile" ADD COLUMN     "hourlyRate" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "ProjectExpense" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "category" "ProjectExpenseCategory" NOT NULL DEFAULT 'OTHER',
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "incurredAt" TIMESTAMP(3) NOT NULL,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "recurrenceMonths" INTEGER,
    "notes" TEXT,
    "vendorId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectExpense_projectId_incurredAt_idx" ON "ProjectExpense"("projectId", "incurredAt");

-- CreateIndex
CREATE INDEX "ProjectExpense_category_idx" ON "ProjectExpense"("category");

-- AddForeignKey
ALTER TABLE "ProjectExpense" ADD CONSTRAINT "ProjectExpense_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectExpense" ADD CONSTRAINT "ProjectExpense_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectExpense" ADD CONSTRAINT "ProjectExpense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
