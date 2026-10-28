-- CreateTable
CREATE TABLE "MatchViewer" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchViewer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchViewer_matchId_idx" ON "MatchViewer"("matchId");

-- CreateIndex
CREATE INDEX "MatchViewer_userId_idx" ON "MatchViewer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchViewer_matchId_userId_key" ON "MatchViewer"("matchId", "userId");

-- AddForeignKey
ALTER TABLE "MatchViewer" ADD CONSTRAINT "MatchViewer_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchViewer" ADD CONSTRAINT "MatchViewer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
