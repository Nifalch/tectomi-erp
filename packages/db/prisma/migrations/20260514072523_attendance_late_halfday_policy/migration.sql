-- CreateEnum
CREATE TYPE "LeaveSource" AS ENUM ('REQUESTED', 'AUTO_HALF_DAY', 'AUTO_LATE_PENALTY');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'LATE', 'HALF_DAY', 'ABSENT', 'ON_LEAVE', 'HOLIDAY');

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "lateMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT';

-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN     "days" DECIMAL(5,2) NOT NULL DEFAULT 1,
ADD COLUMN     "isHalfDay" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isPaid" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "source" "LeaveSource" NOT NULL DEFAULT 'REQUESTED';

-- CreateTable
CREATE TABLE "AttendancePolicy" (
    "id" TEXT NOT NULL,
    "officeStartHour" INTEGER NOT NULL DEFAULT 10,
    "officeEndHour" INTEGER NOT NULL DEFAULT 18,
    "graceMinutes" INTEGER NOT NULL DEFAULT 10,
    "halfDayCutoffHour" INTEGER NOT NULL DEFAULT 12,
    "lateStreakThreshold" INTEGER NOT NULL DEFAULT 3,
    "monthlyPaidLeaveCap" INTEGER NOT NULL DEFAULT 2,
    "workingDaysMask" INTEGER NOT NULL DEFAULT 126,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendancePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Attendance_date_idx" ON "Attendance"("date");

-- CreateIndex
CREATE INDEX "Attendance_userId_date_idx" ON "Attendance"("userId", "date");

-- CreateIndex
CREATE INDEX "Attendance_status_idx" ON "Attendance"("status");

-- CreateIndex
CREATE INDEX "LeaveRequest_userId_startDate_idx" ON "LeaveRequest"("userId", "startDate");

-- CreateIndex
CREATE INDEX "LeaveRequest_status_idx" ON "LeaveRequest"("status");
