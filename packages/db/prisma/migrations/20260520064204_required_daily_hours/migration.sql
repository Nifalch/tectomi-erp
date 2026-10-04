-- AlterTable
ALTER TABLE "AttendancePolicy" ADD COLUMN     "requiredDailyHours" DECIMAL(4,2) NOT NULL DEFAULT 8;

-- AlterTable
ALTER TABLE "EmployeeProfile" ADD COLUMN     "requiredDailyHours" DECIMAL(4,2);
