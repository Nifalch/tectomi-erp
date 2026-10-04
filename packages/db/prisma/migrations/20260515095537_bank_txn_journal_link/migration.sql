-- AlterTable
ALTER TABLE "BankTransaction" ADD COLUMN     "journalEntryId" TEXT;

-- CreateIndex
CREATE INDEX "BankTransaction_journalEntryId_idx" ON "BankTransaction"("journalEntryId");

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
