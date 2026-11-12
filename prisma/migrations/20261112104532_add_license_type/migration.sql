-- CreateEnum
CREATE TYPE "LicenseType" AS ENUM ('BETA', 'FREE', 'BASIC', 'PRO', 'ENTERPRISE');

-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "licenseType" "LicenseType" NOT NULL DEFAULT 'BETA';

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "licenseType" "LicenseType" NOT NULL DEFAULT 'BETA';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "licenseType" "LicenseType" NOT NULL DEFAULT 'BETA';
