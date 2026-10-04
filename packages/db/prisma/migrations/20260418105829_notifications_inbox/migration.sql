-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TASK_ASSIGNED', 'TASK_MENTIONED', 'TASK_WATCHER_ACTIVITY', 'TASK_DUE_SOON', 'TASK_COMMENT', 'SPRINT_STARTED', 'PROJECT_ADDED', 'GENERIC');

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "link" TEXT,
ADD COLUMN     "projectId" TEXT,
ADD COLUMN     "readAt" TIMESTAMP(3),
ADD COLUMN     "taskId" TEXT,
ADD COLUMN     "type" "NotificationType" NOT NULL DEFAULT 'GENERIC',
ALTER COLUMN "body" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
