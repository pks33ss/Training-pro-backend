-- CreateEnum
CREATE TYPE "PaymentReminderType" AS ENUM ('BEFORE_DUE', 'AFTER_DUE');

-- CreateTable
CREATE TABLE "PaymentReminder" (
    "id" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "PaymentReminderType" NOT NULL DEFAULT 'BEFORE_DUE',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentReminder_conceptId_idx" ON "PaymentReminder"("conceptId");

-- CreateIndex
CREATE INDEX "PaymentReminder_userId_idx" ON "PaymentReminder"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReminder_conceptId_userId_type_key" ON "PaymentReminder"("conceptId", "userId", "type");

-- AddForeignKey
ALTER TABLE "PaymentReminder" ADD CONSTRAINT "PaymentReminder_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "PaymentConcept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReminder" ADD CONSTRAINT "PaymentReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
