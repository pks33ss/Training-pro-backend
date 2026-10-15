-- CreateTable
CREATE TABLE "MatchExcludedPlayer" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchExcludedPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchExcludedPlayer_matchId_idx" ON "MatchExcludedPlayer"("matchId");

-- CreateIndex
CREATE INDEX "MatchExcludedPlayer_userId_idx" ON "MatchExcludedPlayer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchExcludedPlayer_matchId_userId_key" ON "MatchExcludedPlayer"("matchId", "userId");

-- AddForeignKey
ALTER TABLE "MatchExcludedPlayer" ADD CONSTRAINT "MatchExcludedPlayer_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchExcludedPlayer" ADD CONSTRAINT "MatchExcludedPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
