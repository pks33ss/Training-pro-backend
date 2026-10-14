/*
  Warnings:

  - Made the column `roleId` on table `ClubMember` required. This step will fail if there are existing NULL values in that column.
  - Made the column `roleId` on table `MembershipRole` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "ClubMember" ALTER COLUMN "roleId" SET NOT NULL;

-- AlterTable
ALTER TABLE "MembershipRole" ALTER COLUMN "roleId" SET NOT NULL;
