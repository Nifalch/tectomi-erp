-- CreateTable
CREATE TABLE "ProjectClientMessage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "fromContactId" TEXT,
    "fromUserId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectClientMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectClientMessage_projectId_createdAt_idx" ON "ProjectClientMessage"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProjectClientMessage" ADD CONSTRAINT "ProjectClientMessage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectClientMessage" ADD CONSTRAINT "ProjectClientMessage_fromContactId_fkey" FOREIGN KEY ("fromContactId") REFERENCES "ClientContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectClientMessage" ADD CONSTRAINT "ProjectClientMessage_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
