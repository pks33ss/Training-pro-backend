-- CreateTable
CREATE TABLE "Play" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "teamId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Play_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayStep" (
    "id" TEXT NOT NULL,
    "playId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Play_teamId_idx" ON "Play"("teamId");

-- CreateIndex
CREATE INDEX "Play_teamId_createdAt_idx" ON "Play"("teamId", "createdAt");

-- CreateIndex
CREATE INDEX "PlayStep_playId_order_idx" ON "PlayStep"("playId", "order");

-- AddForeignKey
ALTER TABLE "Play" ADD CONSTRAINT "Play_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Play" ADD CONSTRAINT "Play_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayStep" ADD CONSTRAINT "PlayStep_playId_fkey" FOREIGN KEY ("playId") REFERENCES "Play"("id") ON DELETE CASCADE ON UPDATE CASCADE;
