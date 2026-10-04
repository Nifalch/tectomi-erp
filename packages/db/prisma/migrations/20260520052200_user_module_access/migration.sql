-- CreateEnum
CREATE TYPE "AccessOverride" AS ENUM ('GRANT', 'DENY');

-- CreateTable
CREATE TABLE "UserModuleAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "override" "AccessOverride" NOT NULL,
    "grantedById" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserModuleAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserModuleAccess_userId_idx" ON "UserModuleAccess"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserModuleAccess_userId_moduleKey_key" ON "UserModuleAccess"("userId", "moduleKey");

-- AddForeignKey
ALTER TABLE "UserModuleAccess" ADD CONSTRAINT "UserModuleAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserModuleAccess" ADD CONSTRAINT "UserModuleAccess_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
