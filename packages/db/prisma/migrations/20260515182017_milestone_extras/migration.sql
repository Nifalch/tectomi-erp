-- AlterTable
ALTER TABLE "ProjectPaymentMilestone" ADD COLUMN     "amount" DECIMAL(12,2),
ADD COLUMN     "isExtra" BOOLEAN NOT NULL DEFAULT false;
