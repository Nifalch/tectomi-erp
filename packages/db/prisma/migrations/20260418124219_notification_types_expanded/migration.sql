-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'PROJECT_MEMBER_ADDED';
ALTER TYPE "NotificationType" ADD VALUE 'PROJECT_DEADLINE_SOON';
ALTER TYPE "NotificationType" ADD VALUE 'CHAT_MENTIONED';
ALTER TYPE "NotificationType" ADD VALUE 'LEAVE_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'LEAVE_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE 'HOLIDAY_UPCOMING';
ALTER TYPE "NotificationType" ADD VALUE 'ANNOUNCEMENT_POSTED';
