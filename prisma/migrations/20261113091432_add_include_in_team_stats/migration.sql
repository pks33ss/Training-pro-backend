-- AlterTable
ALTER TABLE "StatSession" ADD COLUMN     "includeInTeamStats" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "StatSession_teamId_includeInTeamStats_idx" ON "StatSession"("teamId", "includeInTeamStats");
