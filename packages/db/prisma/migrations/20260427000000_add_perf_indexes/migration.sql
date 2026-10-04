-- Add indexes for commonly-queried fields to improve report and aggregation performance.

-- Invoice
CREATE INDEX IF NOT EXISTS "Invoice_clientId_idx" ON "Invoice"("clientId");
CREATE INDEX IF NOT EXISTS "Invoice_projectId_idx" ON "Invoice"("projectId");
CREATE INDEX IF NOT EXISTS "Invoice_status_idx" ON "Invoice"("status");
CREATE INDEX IF NOT EXISTS "Invoice_dueDate_idx" ON "Invoice"("dueDate");

-- TimeEntry
CREATE INDEX IF NOT EXISTS "TimeEntry_userId_idx" ON "TimeEntry"("userId");
CREATE INDEX IF NOT EXISTS "TimeEntry_projectId_idx" ON "TimeEntry"("projectId");
CREATE INDEX IF NOT EXISTS "TimeEntry_taskId_idx" ON "TimeEntry"("taskId");
CREATE INDEX IF NOT EXISTS "TimeEntry_startTime_idx" ON "TimeEntry"("startTime");

-- JournalLine
CREATE INDEX IF NOT EXISTS "JournalLine_journalId_idx" ON "JournalLine"("journalId");
CREATE INDEX IF NOT EXISTS "JournalLine_accountId_idx" ON "JournalLine"("accountId");

-- PaymentAllocation
CREATE INDEX IF NOT EXISTS "PaymentAllocation_paymentId_idx" ON "PaymentAllocation"("paymentId");
CREATE INDEX IF NOT EXISTS "PaymentAllocation_invoiceId_idx" ON "PaymentAllocation"("invoiceId");
CREATE INDEX IF NOT EXISTS "PaymentAllocation_billId_idx" ON "PaymentAllocation"("billId");
