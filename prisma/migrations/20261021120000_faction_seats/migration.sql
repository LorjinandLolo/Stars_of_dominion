-- Friends as cabinet ministers (lib/government/seats). A seat is one account
-- holding one portfolio in one faction; the holder may rule elsewhere and the
-- court does not know which empire until exposed. Orders remember who issued
-- them and through which seat, so a minister's acts are theirs.

-- AlterTable
ALTER TABLE "game_orders" ADD COLUMN "issuedBy" TEXT,
ADD COLUMN "seatId" TEXT;

-- AlterTable
ALTER TABLE "invites" ADD COLUMN "seatPortfolio" TEXT;

-- CreateTable
CREATE TABLE "faction_seats" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "factionId" TEXT NOT NULL,
    "portfolio" TEXT NOT NULL,
    "persona" TEXT NOT NULL,
    "invitedBy" TEXT,
    "exposed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "faction_seats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "faction_seats_userId_key" ON "faction_seats"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "faction_seats_factionId_portfolio_key" ON "faction_seats"("factionId", "portfolio");

-- CreateIndex
CREATE INDEX "faction_seats_factionId_idx" ON "faction_seats"("factionId");
