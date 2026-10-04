-- AlterEnum
ALTER TYPE "ChannelType" ADD VALUE 'DIRECT';
ALTER TYPE "ChannelType" ADD VALUE 'GROUP';

-- DropIndex (unique on projectId) — replaced by plain index
DROP INDEX "Channel_projectId_key";

-- AlterTable
ALTER TABLE "Channel" ADD COLUMN "directKey" TEXT;
ALTER TABLE "Channel" ADD COLUMN "isPrivate" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "Channel_directKey_key" ON "Channel"("directKey");
CREATE INDEX "Channel_projectId_idx" ON "Channel"("projectId");
