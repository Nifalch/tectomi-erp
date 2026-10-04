-- CreateEnum
CREATE TYPE "FounderLedgerDirection" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "FounderLedgerKind" AS ENUM ('LOAN_IN', 'EXPENSE_REIMBURSEMENT', 'DISTRIBUTION', 'REPAYMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "EquityGrantStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'EXERCISED');

-- CreateEnum
CREATE TYPE "EquityGrantType" AS ENUM ('FOUNDER_SHARES', 'ESOP', 'ADVISOR', 'OTHER');

-- CreateTable
CREATE TABLE "FounderLedgerEntry" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "direction" "FounderLedgerDirection" NOT NULL,
    "kind" "FounderLedgerKind" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "description" TEXT,
    "reference" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FounderLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquityGrant" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "EquityGrantType" NOT NULL DEFAULT 'FOUNDER_SHARES',
    "shares" INTEGER NOT NULL,
    "grantDate" DATE NOT NULL,
    "vestingMonths" INTEGER NOT NULL DEFAULT 0,
    "cliffMonths" INTEGER NOT NULL DEFAULT 0,
    "status" "EquityGrantStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquityGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyValuation" (
    "id" TEXT NOT NULL,
    "totalShares" INTEGER NOT NULL,
    "sharePrice" DECIMAL(14,4) NOT NULL,
    "asOf" DATE NOT NULL,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyValuation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FounderLedgerEntry_employeeId_date_idx" ON "FounderLedgerEntry"("employeeId", "date");

-- CreateIndex
CREATE INDEX "FounderLedgerEntry_kind_idx" ON "FounderLedgerEntry"("kind");

-- CreateIndex
CREATE INDEX "EquityGrant_employeeId_idx" ON "EquityGrant"("employeeId");

-- CreateIndex
CREATE INDEX "EquityGrant_type_idx" ON "EquityGrant"("type");

-- CreateIndex
CREATE INDEX "EquityGrant_status_idx" ON "EquityGrant"("status");

-- CreateIndex
CREATE INDEX "CompanyValuation_asOf_idx" ON "CompanyValuation"("asOf");

-- AddForeignKey
ALTER TABLE "FounderLedgerEntry" ADD CONSTRAINT "FounderLedgerEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FounderLedgerEntry" ADD CONSTRAINT "FounderLedgerEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquityGrant" ADD CONSTRAINT "EquityGrant_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquityGrant" ADD CONSTRAINT "EquityGrant_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyValuation" ADD CONSTRAINT "CompanyValuation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
