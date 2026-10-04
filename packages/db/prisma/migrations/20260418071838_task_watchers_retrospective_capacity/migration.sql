-- AlterTable
ALTER TABLE "EmployeeProfile" ADD COLUMN     "weeklyCapacityHrs" DECIMAL(5,2) NOT NULL DEFAULT 40;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "progressPercent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reminderSentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TaskWatcher" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskWatcher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SprintRetrospective" (
    "id" TEXT NOT NULL,
    "sprintId" TEXT NOT NULL,
    "wentWell" TEXT,
    "toImprove" TEXT,
    "actionItems" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SprintRetrospective_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskWatcher_userId_idx" ON "TaskWatcher"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskWatcher_taskId_userId_key" ON "TaskWatcher"("taskId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "SprintRetrospective_sprintId_key" ON "SprintRetrospective"("sprintId");

-- AddForeignKey
ALTER TABLE "TaskWatcher" ADD CONSTRAINT "TaskWatcher_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskWatcher" ADD CONSTRAINT "TaskWatcher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SprintRetrospective" ADD CONSTRAINT "SprintRetrospective_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SprintRetrospective" ADD CONSTRAINT "SprintRetrospective_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
