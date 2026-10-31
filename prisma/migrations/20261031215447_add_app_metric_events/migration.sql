-- CreateTable
CREATE TABLE "AppMetricEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'DEMO_OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppMetricEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppMetricEvent_type_createdAt_idx" ON "AppMetricEvent"("type", "createdAt");
