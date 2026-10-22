-- AlterEnum
ALTER TYPE "StatSessionType" ADD VALUE 'COMPETITION';

-- CreateTable
CREATE TABLE "MatchOpponentPlayer" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT,
    "number" INTEGER NOT NULL,
    "name" TEXT,
    "position" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchOpponentPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchOpponentPlayerStats" (
    "id" TEXT NOT NULL,
    "matchOpponentPlayerId" TEXT NOT NULL,
    "minutes" INTEGER,
    "seconds" INTEGER,
    "points" INTEGER NOT NULL DEFAULT 0,
    "rebounds" INTEGER NOT NULL DEFAULT 0,
    "reboundsOff" INTEGER NOT NULL DEFAULT 0,
    "reboundsDef" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "steals" INTEGER NOT NULL DEFAULT 0,
    "blocks" INTEGER NOT NULL DEFAULT 0,
    "turnovers" INTEGER NOT NULL DEFAULT 0,
    "fouls" INTEGER NOT NULL DEFAULT 0,
    "fieldGoalsMade" INTEGER NOT NULL DEFAULT 0,
    "fieldGoalsAttempted" INTEGER NOT NULL DEFAULT 0,
    "threePointersMade" INTEGER NOT NULL DEFAULT 0,
    "threePointersAttempted" INTEGER NOT NULL DEFAULT 0,
    "freeThrowsMade" INTEGER NOT NULL DEFAULT 0,
    "freeThrowsAttempted" INTEGER NOT NULL DEFAULT 0,
    "blocksAgainst" INTEGER NOT NULL DEFAULT 0,
    "foulsDrawn" INTEGER NOT NULL DEFAULT 0,
    "plusMinus" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchOpponentPlayerStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamOpponentPlayer" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT,
    "number" INTEGER NOT NULL,
    "name" TEXT,
    "position" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamOpponentPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamOpponentPlayerStats" (
    "id" TEXT NOT NULL,
    "teamOpponentPlayerId" TEXT NOT NULL,
    "matchesCount" INTEGER NOT NULL DEFAULT 0,
    "minutes" INTEGER,
    "seconds" INTEGER,
    "points" INTEGER NOT NULL DEFAULT 0,
    "rebounds" INTEGER NOT NULL DEFAULT 0,
    "reboundsOff" INTEGER NOT NULL DEFAULT 0,
    "reboundsDef" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "steals" INTEGER NOT NULL DEFAULT 0,
    "blocks" INTEGER NOT NULL DEFAULT 0,
    "turnovers" INTEGER NOT NULL DEFAULT 0,
    "fouls" INTEGER NOT NULL DEFAULT 0,
    "fieldGoalsMade" INTEGER NOT NULL DEFAULT 0,
    "fieldGoalsAttempted" INTEGER NOT NULL DEFAULT 0,
    "threePointersMade" INTEGER NOT NULL DEFAULT 0,
    "threePointersAttempted" INTEGER NOT NULL DEFAULT 0,
    "freeThrowsMade" INTEGER NOT NULL DEFAULT 0,
    "freeThrowsAttempted" INTEGER NOT NULL DEFAULT 0,
    "blocksAgainst" INTEGER NOT NULL DEFAULT 0,
    "foulsDrawn" INTEGER NOT NULL DEFAULT 0,
    "plusMinus" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamOpponentPlayerStats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchOpponentPlayer_matchId_idx" ON "MatchOpponentPlayer"("matchId");

-- CreateIndex
CREATE INDEX "MatchOpponentPlayer_userId_idx" ON "MatchOpponentPlayer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchOpponentPlayer_matchId_number_key" ON "MatchOpponentPlayer"("matchId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "MatchOpponentPlayerStats_matchOpponentPlayerId_key" ON "MatchOpponentPlayerStats"("matchOpponentPlayerId");

-- CreateIndex
CREATE INDEX "TeamOpponentPlayer_teamId_idx" ON "TeamOpponentPlayer"("teamId");

-- CreateIndex
CREATE INDEX "TeamOpponentPlayer_userId_idx" ON "TeamOpponentPlayer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamOpponentPlayer_teamId_number_key" ON "TeamOpponentPlayer"("teamId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "TeamOpponentPlayerStats_teamOpponentPlayerId_key" ON "TeamOpponentPlayerStats"("teamOpponentPlayerId");

-- AddForeignKey
ALTER TABLE "MatchOpponentPlayer" ADD CONSTRAINT "MatchOpponentPlayer_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchOpponentPlayer" ADD CONSTRAINT "MatchOpponentPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchOpponentPlayerStats" ADD CONSTRAINT "MatchOpponentPlayerStats_matchOpponentPlayerId_fkey" FOREIGN KEY ("matchOpponentPlayerId") REFERENCES "MatchOpponentPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamOpponentPlayer" ADD CONSTRAINT "TeamOpponentPlayer_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamOpponentPlayer" ADD CONSTRAINT "TeamOpponentPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamOpponentPlayerStats" ADD CONSTRAINT "TeamOpponentPlayerStats_teamOpponentPlayerId_fkey" FOREIGN KEY ("teamOpponentPlayerId") REFERENCES "TeamOpponentPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
