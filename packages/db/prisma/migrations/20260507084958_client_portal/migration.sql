-- CreateEnum
CREATE TYPE "ClientContactStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "ClientRequestStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "AcceptanceDecision" AS ENUM ('ACCEPTED', 'REJECTED');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "isClientVisible" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ClientContact" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "status" "ClientContactStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientMagicLink" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,

    CONSTRAINT "ClientMagicLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientPortalSession" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ip" TEXT,

    CONSTRAINT "ClientPortalSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientRequest" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "ClientRequestStatus" NOT NULL DEFAULT 'OPEN',
    "linkedTaskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientRequestMessage" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "authorContactId" TEXT,
    "authorUserId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientRequestMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalAcceptance" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "decision" "AcceptanceDecision" NOT NULL,
    "note" TEXT,
    "ip" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientContact_email_idx" ON "ClientContact"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ClientContact_clientId_email_key" ON "ClientContact"("clientId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "ClientMagicLink_tokenHash_key" ON "ClientMagicLink"("tokenHash");

-- CreateIndex
CREATE INDEX "ClientMagicLink_contactId_idx" ON "ClientMagicLink"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientPortalSession_tokenHash_key" ON "ClientPortalSession"("tokenHash");

-- CreateIndex
CREATE INDEX "ClientPortalSession_contactId_idx" ON "ClientPortalSession"("contactId");

-- CreateIndex
CREATE INDEX "ClientRequest_clientId_status_idx" ON "ClientRequest"("clientId", "status");

-- CreateIndex
CREATE INDEX "ClientRequestMessage_requestId_createdAt_idx" ON "ClientRequestMessage"("requestId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProposalAcceptance_proposalId_key" ON "ProposalAcceptance"("proposalId");

-- AddForeignKey
ALTER TABLE "ClientContact" ADD CONSTRAINT "ClientContact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientMagicLink" ADD CONSTRAINT "ClientMagicLink_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ClientContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPortalSession" ADD CONSTRAINT "ClientPortalSession_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ClientContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientRequest" ADD CONSTRAINT "ClientRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientRequest" ADD CONSTRAINT "ClientRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientRequest" ADD CONSTRAINT "ClientRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "ClientContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientRequest" ADD CONSTRAINT "ClientRequest_linkedTaskId_fkey" FOREIGN KEY ("linkedTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientRequestMessage" ADD CONSTRAINT "ClientRequestMessage_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ClientRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientRequestMessage" ADD CONSTRAINT "ClientRequestMessage_authorContactId_fkey" FOREIGN KEY ("authorContactId") REFERENCES "ClientContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientRequestMessage" ADD CONSTRAINT "ClientRequestMessage_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalAcceptance" ADD CONSTRAINT "ProposalAcceptance_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalAcceptance" ADD CONSTRAINT "ProposalAcceptance_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ClientContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClientRequestMessage"
  ADD CONSTRAINT "client_request_message_author_xor"
  CHECK (
    (CASE WHEN "authorContactId" IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN "authorUserId" IS NOT NULL THEN 1 ELSE 0 END) = 1
  );
