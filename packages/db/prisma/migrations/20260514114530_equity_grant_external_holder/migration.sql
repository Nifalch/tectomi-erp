-- AlterEnum
ALTER TYPE "EquityGrantType" ADD VALUE 'INVESTOR';

-- AlterTable
ALTER TABLE "EquityGrant" ADD COLUMN     "holderEmail" TEXT,
ADD COLUMN     "holderName" TEXT,
ADD COLUMN     "investmentAmount" DECIMAL(14,2),
ADD COLUMN     "investmentDate" DATE,
ADD COLUMN     "organization" TEXT,
ALTER COLUMN "employeeId" DROP NOT NULL;
