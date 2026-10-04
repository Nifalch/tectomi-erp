-- CreateEnum
CREATE TYPE "HrNoteCategory" AS ENUM ('KUDOS', 'DISCIPLINARY', 'ACCOMMODATION', 'GENERAL');

-- CreateEnum
CREATE TYPE "EmploymentEventType" AS ENUM ('HIRED', 'PROMOTED', 'TRANSFERRED', 'SALARY_CHANGE', 'TERMINATED', 'REJOINED');

-- AlterTable
ALTER TABLE "EmployeeProfile" ADD COLUMN     "managerId" TEXT,
ADD COLUMN     "terminatedAt" DATE;

-- CreateTable
CREATE TABLE "HrNote" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "category" "HrNoteCategory" NOT NULL DEFAULT 'GENERAL',
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmploymentStatusEvent" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "EmploymentEventType" NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT,
    "effectiveDate" DATE NOT NULL,
    "reason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmploymentStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HrNote_employeeId_createdAt_idx" ON "HrNote"("employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "EmploymentStatusEvent_employeeId_effectiveDate_idx" ON "EmploymentStatusEvent"("employeeId", "effectiveDate");

-- AddForeignKey
ALTER TABLE "EmployeeProfile" ADD CONSTRAINT "EmployeeProfile_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrNote" ADD CONSTRAINT "HrNote_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrNote" ADD CONSTRAINT "HrNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmploymentStatusEvent" ADD CONSTRAINT "EmploymentStatusEvent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmploymentStatusEvent" ADD CONSTRAINT "EmploymentStatusEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
