-- CreateTable
CREATE TABLE "ClubMemberRole" (
    "id" TEXT NOT NULL,
    "clubMemberId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'ALL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClubMemberRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubMemberRoleTeamScope" (
    "id" TEXT NOT NULL,
    "clubMemberRoleId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClubMemberRoleTeamScope_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClubMemberRole_clubMemberId_idx" ON "ClubMemberRole"("clubMemberId");

-- CreateIndex
CREATE INDEX "ClubMemberRole_roleId_idx" ON "ClubMemberRole"("roleId");

-- CreateIndex
CREATE INDEX "ClubMemberRole_scope_idx" ON "ClubMemberRole"("scope");

-- CreateIndex
CREATE UNIQUE INDEX "ClubMemberRole_clubMemberId_roleId_key" ON "ClubMemberRole"("clubMemberId", "roleId");

-- CreateIndex
CREATE INDEX "ClubMemberRoleTeamScope_clubMemberRoleId_idx" ON "ClubMemberRoleTeamScope"("clubMemberRoleId");

-- CreateIndex
CREATE INDEX "ClubMemberRoleTeamScope_teamId_idx" ON "ClubMemberRoleTeamScope"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubMemberRoleTeamScope_clubMemberRoleId_teamId_key" ON "ClubMemberRoleTeamScope"("clubMemberRoleId", "teamId");

-- AddForeignKey
ALTER TABLE "ClubMemberRole" ADD CONSTRAINT "ClubMemberRole_clubMemberId_fkey" FOREIGN KEY ("clubMemberId") REFERENCES "ClubMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubMemberRole" ADD CONSTRAINT "ClubMemberRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubMemberRoleTeamScope" ADD CONSTRAINT "ClubMemberRoleTeamScope_clubMemberRoleId_fkey" FOREIGN KEY ("clubMemberRoleId") REFERENCES "ClubMemberRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubMemberRoleTeamScope" ADD CONSTRAINT "ClubMemberRoleTeamScope_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
