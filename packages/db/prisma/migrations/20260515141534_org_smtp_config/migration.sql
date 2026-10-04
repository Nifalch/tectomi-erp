-- AlterTable
ALTER TABLE "OrganizationSettings" ADD COLUMN     "smtpEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "smtpFrom" TEXT,
ADD COLUMN     "smtpHost" TEXT,
ADD COLUMN     "smtpPass" TEXT,
ADD COLUMN     "smtpPort" INTEGER,
ADD COLUMN     "smtpUser" TEXT;
