-- AlterTable
ALTER TABLE "AttendancePolicy" ADD COLUMN     "halfDayCutoffMinute" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "officeEndMinute" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "officeStartMinute" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "EmployeeProfile" ADD COLUMN     "shiftEndMinute" INTEGER DEFAULT 0,
ADD COLUMN     "shiftStartMinute" INTEGER DEFAULT 0;
