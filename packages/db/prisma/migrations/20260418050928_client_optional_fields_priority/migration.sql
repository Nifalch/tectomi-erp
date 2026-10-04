-- CreateEnum
CREATE TYPE "ClientPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'VIP');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "industry" TEXT,
ADD COLUMN     "priority" "ClientPriority" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE',
ALTER COLUMN "contactPerson" DROP NOT NULL,
ALTER COLUMN "email" DROP NOT NULL;
