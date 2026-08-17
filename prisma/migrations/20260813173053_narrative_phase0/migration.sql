-- CreateTable
CREATE TABLE "chronicle_events" (
    "id" TEXT NOT NULL,
    "tick" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "importance" INTEGER NOT NULL,
    "actorIds" TEXT NOT NULL,
    "targetIds" TEXT NOT NULL,
    "location" TEXT,
    "facts" TEXT NOT NULL,
    "attribution" TEXT NOT NULL,
    "coalesceKey" TEXT,
    "narratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chronicle_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "narrative_articles" (
    "id" TEXT NOT NULL,
    "eventIds" TEXT NOT NULL,
    "publisherId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "stance" TEXT,
    "day" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "narrative_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feuds" (
    "id" TEXT NOT NULL,
    "factionAId" TEXT NOT NULL,
    "factionBId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedTick" INTEGER NOT NULL,
    "lastEventAt" INTEGER NOT NULL,
    "eventCount" INTEGER NOT NULL,
    "topEventIds" TEXT NOT NULL,
    "epithet" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feuds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chronicle_events_narratedAt_importance_idx" ON "chronicle_events"("narratedAt", "importance");

-- CreateIndex
CREATE INDEX "chronicle_events_type_tick_idx" ON "chronicle_events"("type", "tick");

-- CreateIndex
CREATE INDEX "narrative_articles_day_idx" ON "narrative_articles"("day");

-- CreateIndex
CREATE UNIQUE INDEX "feuds_factionAId_factionBId_key" ON "feuds"("factionAId", "factionBId");
