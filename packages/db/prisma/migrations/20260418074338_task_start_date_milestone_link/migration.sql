-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "milestoneId" TEXT,
ADD COLUMN     "startDate" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
