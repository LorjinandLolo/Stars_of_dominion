-- How the game is played: sessions, panels opened, orders given and refused,
-- errors players ran into (lib/telemetry). Never anything a player typed.

-- CreateTable
CREATE TABLE "telemetry_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "factionId" TEXT,
    "kind" TEXT NOT NULL,
    "detail" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telemetry_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "telemetry_events_userId_at_idx" ON "telemetry_events"("userId", "at");

-- CreateIndex
CREATE INDEX "telemetry_events_factionId_at_idx" ON "telemetry_events"("factionId", "at");

-- CreateIndex
CREATE INDEX "telemetry_events_kind_at_idx" ON "telemetry_events"("kind", "at");
