-- Reconciliación pre-8.1
-- Estos cambios ya están aplicados en la BD (se hicieron con `prisma db push`)
-- pero no estaban en el historial de migraciones. Esta migración se marca
-- como aplicada sin ejecutarla (ver `prisma migrate resolve --applied`).

-- Team.logo
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "logo" TEXT;

-- User: quitar tacticalBackgroundUrl (legacy), añadir las nuevas columnas
ALTER TABLE "User" DROP COLUMN IF EXISTS "tacticalBackgroundUrl";
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "hiddenTabs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tacticalBackgroundUrlFull" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tacticalBackgroundUrlHalf" TEXT;