-- DropForeignKey
ALTER TABLE "ClientContact" DROP CONSTRAINT "ClientContact_clientId_fkey";

-- CreateIndex
CREATE INDEX "ClientRequest_createdById_idx" ON "ClientRequest"("createdById");

-- AddForeignKey
ALTER TABLE "ClientContact" ADD CONSTRAINT "ClientContact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
