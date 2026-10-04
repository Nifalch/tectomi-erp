-- CreateEnum
CREATE TYPE "GoalType" AS ENUM ('GOAL', 'OKR', 'KPI');

-- Coerce any out-of-enum historical values to GOAL before the cast so the
-- ALTER COLUMN succeeds. Current rows are already GOAL/OKR/KPI; this is defensive.
UPDATE "Goal" SET "type" = 'GOAL' WHERE "type" NOT IN ('GOAL', 'OKR', 'KPI');

-- AlterTable: drop default first so the cast doesn't try to coerce the string default
ALTER TABLE "Goal" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "Goal" ALTER COLUMN "type" TYPE "GoalType" USING "type"::"GoalType";
ALTER TABLE "Goal" ALTER COLUMN "type" SET DEFAULT 'GOAL';
