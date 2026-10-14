-- AlterTable
ALTER TABLE "PendingInvitation" ADD COLUMN     "roleId" TEXT;

-- CreateIndex
CREATE INDEX "PendingInvitation_roleId_idx" ON "PendingInvitation"("roleId");

-- AddForeignKey
ALTER TABLE "PendingInvitation" ADD CONSTRAINT "PendingInvitation_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
