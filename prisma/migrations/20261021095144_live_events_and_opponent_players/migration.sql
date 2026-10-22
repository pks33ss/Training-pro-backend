/*
  Warnings:

  - The values [REBOUND] on the enum `MatchEventType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "MatchEventType_new" AS ENUM ('POINTS_2', 'POINTS_3', 'FREE_THROW', 'REBOUND_OFF', 'REBOUND_DEF', 'ASSIST', 'STEAL', 'BLOCK', 'TURNOVER', 'FOUL');
ALTER TABLE "MatchEvent" ALTER COLUMN "type" TYPE "MatchEventType_new" USING ("type"::text::"MatchEventType_new");
ALTER TYPE "MatchEventType" RENAME TO "MatchEventType_old";
ALTER TYPE "MatchEventType_new" RENAME TO "MatchEventType";
DROP TYPE "public"."MatchEventType_old";
COMMIT;

-- DropIndex
DROP INDEX "MatchEvent_matchId_voidedAt_idx";

-- AlterTable
ALTER TABLE "MatchEvent" ADD COLUMN     "isOpponent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "opponentPlayerId" TEXT,
ADD COLUMN     "statSessionId" TEXT,
ALTER COLUMN "matchId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "MatchPlayerStats" ADD COLUMN     "reboundsDef" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reboundsOff" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "StatSession" ADD COLUMN     "clockRunning" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "clockSeconds" INTEGER NOT NULL DEFAULT 600,
ADD COLUMN     "clockStartedAt" TIMESTAMP(3),
ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "currentPeriod" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "opponentPlayerCount" INTEGER,
ADD COLUMN     "opponentTeamName" TEXT,
ADD COLUMN     "periodCount" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN     "quarterDuration" INTEGER NOT NULL DEFAULT 600;

-- CreateTable
CREATE TABLE "OpponentPlayer" (
    "id" TEXT NOT NULL,
    "statSessionId" TEXT NOT NULL,
    "userId" TEXT,
    "number" INTEGER NOT NULL,
    "name" TEXT,
    "position" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpponentPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpponentPlayerStats" (
    "id" TEXT NOT NULL,
    "opponentPlayerId" TEXT NOT NULL,
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

    CONSTRAINT "OpponentPlayerStats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OpponentPlayer_statSessionId_idx" ON "OpponentPlayer"("statSessionId");

-- CreateIndex
CREATE INDEX "OpponentPlayer_userId_idx" ON "OpponentPlayer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OpponentPlayer_statSessionId_number_key" ON "OpponentPlayer"("statSessionId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "OpponentPlayerStats_opponentPlayerId_key" ON "OpponentPlayerStats"("opponentPlayerId");

-- CreateIndex
CREATE INDEX "MatchEvent_statSessionId_createdAt_idx" ON "MatchEvent"("statSessionId", "createdAt");

-- CreateIndex
CREATE INDEX "MatchEvent_statSessionId_isOpponent_voidedAt_idx" ON "MatchEvent"("statSessionId", "isOpponent", "voidedAt");

-- CreateIndex
CREATE INDEX "MatchEvent_opponentPlayerId_idx" ON "MatchEvent"("opponentPlayerId");

-- AddForeignKey
ALTER TABLE "MatchEvent" ADD CONSTRAINT "MatchEvent_statSessionId_fkey" FOREIGN KEY ("statSessionId") REFERENCES "StatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchEvent" ADD CONSTRAINT "MatchEvent_opponentPlayerId_fkey" FOREIGN KEY ("opponentPlayerId") REFERENCES "OpponentPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpponentPlayer" ADD CONSTRAINT "OpponentPlayer_statSessionId_fkey" FOREIGN KEY ("statSessionId") REFERENCES "StatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpponentPlayer" ADD CONSTRAINT "OpponentPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpponentPlayerStats" ADD CONSTRAINT "OpponentPlayerStats_opponentPlayerId_fkey" FOREIGN KEY ("opponentPlayerId") REFERENCES "OpponentPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────
-- Backfill (añadido a mano, no lo genera Prisma).
--
-- MatchPlayerStats.rebounds existentes se reparten así:
--   reboundsOff = 0
--   reboundsDef = rebounds
-- porque no sabemos el desglose real. El usuario puede corregirlo
-- editando las stats. `rebounds` (total) sigue igual.
-- ─────────────────────────────────────────────────────────────
UPDATE "MatchPlayerStats"
SET "reboundsDef" = "rebounds",
    "reboundsOff" = 0
WHERE "rebounds" > 0;