-- AlterTable
ALTER TABLE "EmployeeProfile" ADD COLUMN     "isFounder" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PaySlip" ADD COLUMN     "deferredAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "drawnAmount" DECIMAL(12,2);
