-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('RENT', 'UTILITIES', 'INTERNET', 'SUBSCRIPTION', 'OFFICE_SUPPLIES', 'TRAVEL', 'MEALS', 'EQUIPMENT', 'MARKETING', 'PROFESSIONAL_FEES', 'INSURANCE', 'REPAIRS', 'TRAINING', 'TAXES', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpenseFrequency" AS ENUM ('MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY');

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "expenseCategory" "ExpenseCategory",
ADD COLUMN     "recurringExpenseId" TEXT;

-- CreateTable
CREATE TABLE "RecurringExpense" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL DEFAULT 'OTHER',
    "vendorId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
    "bankAccountId" TEXT,
    "frequency" "ExpenseFrequency" NOT NULL DEFAULT 'MONTHLY',
    "dayOfMonth" INTEGER NOT NULL DEFAULT 1,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastGeneratedFor" DATE,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecurringExpense_isActive_idx" ON "RecurringExpense"("isActive");

-- CreateIndex
CREATE INDEX "RecurringExpense_category_idx" ON "RecurringExpense"("category");

-- CreateIndex
CREATE INDEX "Payment_expenseCategory_idx" ON "Payment"("expenseCategory");

-- CreateIndex
CREATE INDEX "Payment_recurringExpenseId_idx" ON "Payment"("recurringExpenseId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_recurringExpenseId_fkey" FOREIGN KEY ("recurringExpenseId") REFERENCES "RecurringExpense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
