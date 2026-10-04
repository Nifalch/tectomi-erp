-- CreateEnum
CREATE TYPE "CredentialType" AS ENUM ('PASSWORD', 'API_KEY', 'SSH_KEY', 'DATABASE', 'CERTIFICATE', 'ENV_FILE', 'CARD', 'NOTE', 'GENERIC');

-- CreateEnum
CREATE TYPE "CredentialAccessRole" AS ENUM ('VIEWER', 'EDITOR', 'OWNER');

-- CreateEnum
CREATE TYPE "CredentialAuditAction" AS ENUM ('CREATED', 'UPDATED', 'REVEALED', 'SHARED', 'UNSHARED', 'ROLE_CHANGED', 'ROTATED', 'DELETED', 'RENAMED', 'FOLDER_MOVED');

-- CreateTable
CREATE TABLE "CredentialFolder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "parentId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CredentialFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Credential" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CredentialType" NOT NULL DEFAULT 'PASSWORD',
    "description" TEXT,
    "username" TEXT,
    "url" TEXT,
    "ciphertext" TEXT NOT NULL,
    "metadata" JSONB,
    "expiresAt" TIMESTAMP(3),
    "lastRotatedAt" TIMESTAMP(3),
    "rotationIntervalDays" INTEGER,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "folderId" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CredentialAccess" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "CredentialAccessRole" NOT NULL DEFAULT 'VIEWER',
    "grantedById" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CredentialAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CredentialAudit" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "CredentialAuditAction" NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CredentialAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CredentialFolder_parentId_idx" ON "CredentialFolder"("parentId");

-- CreateIndex
CREATE INDEX "CredentialFolder_createdById_idx" ON "CredentialFolder"("createdById");

-- CreateIndex
CREATE INDEX "Credential_ownerId_idx" ON "Credential"("ownerId");

-- CreateIndex
CREATE INDEX "Credential_folderId_idx" ON "Credential"("folderId");

-- CreateIndex
CREATE INDEX "Credential_type_idx" ON "Credential"("type");

-- CreateIndex
CREATE INDEX "Credential_expiresAt_idx" ON "Credential"("expiresAt");

-- CreateIndex
CREATE INDEX "CredentialAccess_userId_idx" ON "CredentialAccess"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CredentialAccess_credentialId_userId_key" ON "CredentialAccess"("credentialId", "userId");

-- CreateIndex
CREATE INDEX "CredentialAudit_credentialId_createdAt_idx" ON "CredentialAudit"("credentialId", "createdAt");

-- CreateIndex
CREATE INDEX "CredentialAudit_userId_idx" ON "CredentialAudit"("userId");

-- AddForeignKey
ALTER TABLE "CredentialFolder" ADD CONSTRAINT "CredentialFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CredentialFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialFolder" ADD CONSTRAINT "CredentialFolder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "CredentialFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialAccess" ADD CONSTRAINT "CredentialAccess_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "Credential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialAccess" ADD CONSTRAINT "CredentialAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialAccess" ADD CONSTRAINT "CredentialAccess_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialAudit" ADD CONSTRAINT "CredentialAudit_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "Credential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialAudit" ADD CONSTRAINT "CredentialAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
