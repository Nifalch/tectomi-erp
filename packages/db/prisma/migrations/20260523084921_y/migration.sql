/*
  Warnings:

  - A unique constraint covering the columns `[biometricEnrollId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "biometricEnrollId" TEXT;

-- CreateTable
CREATE TABLE "BiometricDevice" (
    "id" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "name" TEXT,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceModel" TEXT,
    "firmware" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BiometricDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BiometricLog" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceUserId" TEXT NOT NULL,
    "userId" TEXT,
    "punchAt" TIMESTAMP(3) NOT NULL,
    "punchType" INTEGER NOT NULL DEFAULT 0,
    "verifyMode" INTEGER NOT NULL DEFAULT 0,
    "raw" TEXT NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BiometricLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BiometricDevice_serialNumber_key" ON "BiometricDevice"("serialNumber");

-- CreateIndex
CREATE INDEX "BiometricLog_userId_punchAt_idx" ON "BiometricLog"("userId", "punchAt");

-- CreateIndex
CREATE INDEX "BiometricLog_processed_idx" ON "BiometricLog"("processed");

-- CreateIndex
CREATE INDEX "BiometricLog_deviceId_createdAt_idx" ON "BiometricLog"("deviceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BiometricLog_deviceId_deviceUserId_punchAt_key" ON "BiometricLog"("deviceId", "deviceUserId", "punchAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_biometricEnrollId_key" ON "User"("biometricEnrollId");

-- AddForeignKey
ALTER TABLE "BiometricLog" ADD CONSTRAINT "BiometricLog_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "BiometricDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BiometricLog" ADD CONSTRAINT "BiometricLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
