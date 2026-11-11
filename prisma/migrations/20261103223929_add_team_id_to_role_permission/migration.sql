/*
  Warnings:

  - A unique constraint covering the columns `[roleId,resource,action,scope,teamId]` on the table `RolePermission` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "RolePermission_roleId_resource_action_scope_key";

-- AlterTable
ALTER TABLE "RolePermission" ADD COLUMN     "teamId" TEXT;

-- CreateIndex
CREATE INDEX "RolePermission_teamId_idx" ON "RolePermission"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleId_resource_action_scope_teamId_key" ON "RolePermission"("roleId", "resource", "action", "scope", "teamId");
