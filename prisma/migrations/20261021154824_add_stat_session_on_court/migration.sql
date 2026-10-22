-- CreateTable
CREATE TABLE "StatSessionOnCourt" (
    "id" TEXT NOT NULL,
    "statSessionId" TEXT NOT NULL,
    "userId" TEXT,
    "opponentPlayerId" TEXT,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exitedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StatSessionOnCourt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StatSessionOnCourt_statSessionId_idx" ON "StatSessionOnCourt"("statSessionId");

-- CreateIndex
CREATE INDEX "StatSessionOnCourt_statSessionId_userId_idx" ON "StatSessionOnCourt"("statSessionId", "userId");

-- CreateIndex
CREATE INDEX "StatSessionOnCourt_statSessionId_opponentPlayerId_idx" ON "StatSessionOnCourt"("statSessionId", "opponentPlayerId");

-- CreateIndex
CREATE INDEX "StatSessionOnCourt_statSessionId_exitedAt_idx" ON "StatSessionOnCourt"("statSessionId", "exitedAt");

-- AddForeignKey
ALTER TABLE "StatSessionOnCourt" ADD CONSTRAINT "StatSessionOnCourt_statSessionId_fkey" FOREIGN KEY ("statSessionId") REFERENCES "StatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatSessionOnCourt" ADD CONSTRAINT "StatSessionOnCourt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatSessionOnCourt" ADD CONSTRAINT "StatSessionOnCourt_opponentPlayerId_fkey" FOREIGN KEY ("opponentPlayerId") REFERENCES "OpponentPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
