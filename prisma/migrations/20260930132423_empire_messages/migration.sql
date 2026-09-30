-- CreateTable
CREATE TABLE "empire_messages" (
    "id" TEXT NOT NULL,
    "fromFactionId" TEXT NOT NULL,
    "toFactionId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "galacticDay" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "empire_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "empire_messages_createdAt_idx" ON "empire_messages"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "empire_messages_fromFactionId_toFactionId_galacticDay_key" ON "empire_messages"("fromFactionId", "toFactionId", "galacticDay");
