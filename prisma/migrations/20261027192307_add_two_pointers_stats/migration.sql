-- Migration: add_two_pointers_stats
-- Añade twoPointersMade / twoPointersAttempted a las 4 tablas de stats.
-- Puebla 2P a partir de los datos actuales:
--   twoPointersMade      = fieldGoalsMade      - threePointersMade
--   twoPointersAttempted = fieldGoalsAttempted - threePointersAttempted
-- Si FGM < TGM (dato incoherente), se deja en 0 y se conserva el valor
-- original en fieldGoalsMade (se corregirá a mano si procede).
-- NO se recalculan points ni fieldGoalsMade: solo se añaden las columnas 2P.
-- Los points descoordinados históricos se corrigen a mano (fuera del alcance
-- de esta migración).

-- ─── MatchPlayerStats ─────────────────────────────────────────
ALTER TABLE "MatchPlayerStats"
  ADD COLUMN "twoPointersMade"      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "twoPointersAttempted" INTEGER NOT NULL DEFAULT 0;

UPDATE "MatchPlayerStats"
SET
  "twoPointersMade"      = GREATEST("fieldGoalsMade"      - "threePointersMade",      0),
  "twoPointersAttempted" = GREATEST("fieldGoalsAttempted" - "threePointersAttempted", 0)
WHERE "fieldGoalsMade" >= "threePointersMade"
  AND "fieldGoalsAttempted" >= "threePointersAttempted";

-- ─── OpponentPlayerStats ──────────────────────────────────────
ALTER TABLE "OpponentPlayerStats"
  ADD COLUMN "twoPointersMade"      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "twoPointersAttempted" INTEGER NOT NULL DEFAULT 0;

UPDATE "OpponentPlayerStats"
SET
  "twoPointersMade"      = GREATEST("fieldGoalsMade"      - "threePointersMade",      0),
  "twoPointersAttempted" = GREATEST("fieldGoalsAttempted" - "threePointersAttempted", 0)
WHERE "fieldGoalsMade" >= "threePointersMade"
  AND "fieldGoalsAttempted" >= "threePointersAttempted";

-- ─── MatchOpponentPlayerStats ─────────────────────────────────
ALTER TABLE "MatchOpponentPlayerStats"
  ADD COLUMN "twoPointersMade"      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "twoPointersAttempted" INTEGER NOT NULL DEFAULT 0;

UPDATE "MatchOpponentPlayerStats"
SET
  "twoPointersMade"      = GREATEST("fieldGoalsMade"      - "threePointersMade",      0),
  "twoPointersAttempted" = GREATEST("fieldGoalsAttempted" - "threePointersAttempted", 0)
WHERE "fieldGoalsMade" >= "threePointersMade"
  AND "fieldGoalsAttempted" >= "threePointersAttempted";

-- ─── TeamOpponentPlayerStats ──────────────────────────────────
ALTER TABLE "TeamOpponentPlayerStats"
  ADD COLUMN "twoPointersMade"      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "twoPointersAttempted" INTEGER NOT NULL DEFAULT 0;

UPDATE "TeamOpponentPlayerStats"
SET
  "twoPointersMade"      = GREATEST("fieldGoalsMade"      - "threePointersMade",      0),
  "twoPointersAttempted" = GREATEST("fieldGoalsAttempted" - "threePointersAttempted", 0)
WHERE "fieldGoalsMade" >= "threePointersMade"
  AND "fieldGoalsAttempted" >= "threePointersAttempted";