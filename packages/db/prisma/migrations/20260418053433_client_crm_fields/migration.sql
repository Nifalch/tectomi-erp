-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "accountManagerId" TEXT,
ADD COLUMN     "acquiredAt" DATE,
ADD COLUMN     "nextFollowUpAt" TIMESTAMP(3),
ADD COLUMN     "portalEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "referralSource" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_accountManagerId_fkey" FOREIGN KEY ("accountManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
