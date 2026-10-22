/*
  Warnings:

  - A unique constraint covering the columns `[statSessionId,userId]` on the table `MatchPlayerStats` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "StatSessionType" AS ENUM ('MATCH_LINKED', 'FRIENDLY', 'TRAINING', 'OTHER');

-- AlterTable
ALTER TABLE "MatchPlayerStats" ADD COLUMN     "statSessionId" TEXT,
ALTER COLUMN "matchId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "StatSession" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "matchId" TEXT,
    "type" "StatSessionType" NOT NULL,
    "label" TEXT NOT NULL,
    "statDate" TIMESTAMP(3) NOT NULL,
    "opponent" TEXT,
    "teamScore" INTEGER,
    "opponentScore" INTEGER,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StatSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StatSession_teamId_statDate_idx" ON "StatSession"("teamId", "statDate");

-- CreateIndex
CREATE INDEX "StatSession_teamId_type_idx" ON "StatSession"("teamId", "type");

-- CreateIndex
CREATE INDEX "StatSession_createdById_idx" ON "StatSession"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "StatSession_matchId_key" ON "StatSession"("matchId");

-- CreateIndex
CREATE INDEX "MatchPlayerStats_statSessionId_idx" ON "MatchPlayerStats"("statSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchPlayerStats_statSessionId_userId_key" ON "MatchPlayerStats"("statSessionId", "userId");

-- AddForeignKey
ALTER TABLE "MatchPlayerStats" ADD CONSTRAINT "MatchPlayerStats_statSessionId_fkey" FOREIGN KEY ("statSessionId") REFERENCES "StatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatSession" ADD CONSTRAINT "StatSession_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatSession" ADD CONSTRAINT "StatSession_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatSession" ADD CONSTRAINT "StatSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────
-- Backfill (añadido a mano, no lo genera Prisma)
--
-- Crea una StatSession MATCH_LINKED por cada Match que ya tenga
-- filas en MatchPlayerStats, y enlaza esas filas con su sesión.
--
-- Idempotente por diseño: si por lo que sea se ejecutara dos veces,
-- el WHERE EXISTS / NOT EXISTS evita duplicar. (No debería ejecutarse
-- dos veces porque Prisma marca la migración como aplicada, pero
-- por si acaso.)
-- ─────────────────────────────────────────────────────────────

-- 1) Crear una StatSession por cada Match con stats existentes
INSERT INTO "StatSession" (
    "id", "teamId", "matchId", "type", "label", "statDate",
    "opponent", "teamScore", "opponentScore",
    "createdById", "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid()::text                                          AS "id",
    m."teamId"                                                       AS "teamId",
    m."id"                                                           AS "matchId",
    'MATCH_LINKED'::"StatSessionType"                                AS "type",
    'Partido vs ' || m."opponent" || ' — ' || to_char(m."date", 'YYYY-MM-DD') AS "label",
    m."date"                                                         AS "statDate",
    m."opponent"                                                     AS "opponent",
    m."teamScore"                                                    AS "teamScore",
    m."opponentScore"                                                AS "opponentScore",
    m."createdById"                                                  AS "createdById",
    m."createdAt"                                                    AS "createdAt",
    now()                                                            AS "updatedAt"
FROM "Match" m
WHERE EXISTS (
    SELECT 1 FROM "MatchPlayerStats" ps WHERE ps."matchId" = m."id"
)
AND NOT EXISTS (
    SELECT 1 FROM "StatSession" ss WHERE ss."matchId" = m."id"
);

-- 2) Enlazar cada fila de MatchPlayerStats con su StatSession
UPDATE "MatchPlayerStats" ps
SET "statSessionId" = ss."id"
FROM "StatSession" ss
WHERE ss."matchId" = ps."matchId"
  AND ps."statSessionId" IS NULL;