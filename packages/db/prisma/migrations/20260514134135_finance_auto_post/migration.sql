-- CreateEnum
CREATE TYPE "JournalEntrySource" AS ENUM ('MANUAL', 'PAYMENT', 'PAY_SLIP', 'FOUNDER_LEDGER', 'OPENING_BALANCE');

-- AlterTable
ALTER TABLE "BankAccount" ADD COLUMN     "isPrimary" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "JournalEntry" ADD COLUMN     "source" "JournalEntrySource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "sourceId" TEXT;

-- CreateIndex
CREATE INDEX "JournalEntry_source_sourceId_idx" ON "JournalEntry"("source", "sourceId");
