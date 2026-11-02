-- DropForeignKey
ALTER TABLE "MembershipRole" DROP CONSTRAINT "MembershipRole_roleId_fkey";

-- AddForeignKey
ALTER TABLE "MembershipRole" ADD CONSTRAINT "MembershipRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
