-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CredentialType" ADD VALUE 'SOCIAL_MEDIA';
ALTER TYPE "CredentialType" ADD VALUE 'EMAIL_ACCOUNT';

-- AlterTable
ALTER TABLE "Credential" ADD COLUMN     "highSecurity" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requiresReason" BOOLEAN NOT NULL DEFAULT false;
