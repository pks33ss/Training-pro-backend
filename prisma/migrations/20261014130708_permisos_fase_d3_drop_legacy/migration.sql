/*
  Warnings:

  - You are about to drop the column `role` on the `ClubMember` table. All the data in the column will be lost.
  - You are about to drop the column `role` on the `MembershipRole` table. All the data in the column will be lost.
  - You are about to drop the column `role` on the `PendingInvitation` table. All the data in the column will be lost.
  - Made the column `roleId` on table `PendingInvitation` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "MembershipRole_membershipId_role_key";

-- DropIndex
DROP INDEX "MembershipRole_role_idx";

-- AlterTable
ALTER TABLE "ClubMember" DROP COLUMN "role";

-- AlterTable
ALTER TABLE "MembershipRole" DROP COLUMN "role";

-- AlterTable
ALTER TABLE "PendingInvitation" DROP COLUMN "role",
ALTER COLUMN "roleId" SET NOT NULL;

-- DropEnum
DROP TYPE "ClubRole";

-- DropEnum
DROP TYPE "MembershipRoleType";
