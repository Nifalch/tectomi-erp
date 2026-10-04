-- CreateEnum
CREATE TYPE "TaskStatusCategory" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE');

-- AlterTable
ALTER TABLE "ProjectTaskStatus" ADD COLUMN     "category" "TaskStatusCategory" NOT NULL DEFAULT 'TODO';

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_customStatusId_fkey" FOREIGN KEY ("customStatusId") REFERENCES "ProjectTaskStatus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
