-- CreateEnum
CREATE TYPE "TimeEntryApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "customStatusId" TEXT,
ADD COLUMN     "recurringTaskId" TEXT;

-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN     "approvalStatus" "TimeEntryApprovalStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "rejectionReason" TEXT;

-- CreateTable
CREATE TABLE "RecurringTaskTemplate" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "assignedToId" TEXT,
    "storyPoints" INTEGER,
    "estimatedHrs" DECIMAL(8,2),
    "sprintAssign" BOOLEAN NOT NULL DEFAULT false,
    "frequency" "Frequency" NOT NULL DEFAULT 'WEEKLY',
    "dayOfWeek" INTEGER,
    "dayOfMonth" INTEGER,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "nextRunAt" DATE NOT NULL,
    "lastRunAt" DATE,
    "status" "RecurringStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringTaskTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectTaskStatus" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#94a3b8',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectTaskStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SprintBurndownSnapshot" (
    "id" TEXT NOT NULL,
    "sprintId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "pointsCompleted" INTEGER NOT NULL DEFAULT 0,
    "pointsRemaining" INTEGER NOT NULL DEFAULT 0,
    "tasksCompleted" INTEGER NOT NULL DEFAULT 0,
    "tasksRemaining" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SprintBurndownSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecurringTaskTemplate_projectId_idx" ON "RecurringTaskTemplate"("projectId");

-- CreateIndex
CREATE INDEX "RecurringTaskTemplate_nextRunAt_idx" ON "RecurringTaskTemplate"("nextRunAt");

-- CreateIndex
CREATE INDEX "ProjectTaskStatus_projectId_idx" ON "ProjectTaskStatus"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectTaskStatus_projectId_name_key" ON "ProjectTaskStatus"("projectId", "name");

-- CreateIndex
CREATE INDEX "SprintBurndownSnapshot_sprintId_idx" ON "SprintBurndownSnapshot"("sprintId");

-- CreateIndex
CREATE UNIQUE INDEX "SprintBurndownSnapshot_sprintId_date_key" ON "SprintBurndownSnapshot"("sprintId", "date");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_recurringTaskId_fkey" FOREIGN KEY ("recurringTaskId") REFERENCES "RecurringTaskTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTaskTemplate" ADD CONSTRAINT "RecurringTaskTemplate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTaskTemplate" ADD CONSTRAINT "RecurringTaskTemplate_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTaskTemplate" ADD CONSTRAINT "RecurringTaskTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTaskStatus" ADD CONSTRAINT "ProjectTaskStatus_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SprintBurndownSnapshot" ADD CONSTRAINT "SprintBurndownSnapshot_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
