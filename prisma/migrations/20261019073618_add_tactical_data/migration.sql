-- AlterTable
ALTER TABLE "LibraryMedia" ADD COLUMN     "tacticalData" JSONB;

-- AlterTable
ALTER TABLE "Media" ADD COLUMN     "tacticalData" JSONB;

-- AlterTable
ALTER TABLE "PlayStep" ADD COLUMN     "tacticalData" JSONB;
