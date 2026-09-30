-- Messages between players lose the one-per-Galactic-Day limit; a short
-- cooldown per sender and recipient (checked in lib/messages) replaces it.

-- DropIndex
DROP INDEX "empire_messages_fromFactionId_toFactionId_galacticDay_key";

-- AlterTable
ALTER TABLE "empire_messages" DROP COLUMN "galacticDay";

-- CreateIndex
CREATE INDEX "empire_messages_fromFactionId_toFactionId_createdAt_idx" ON "empire_messages"("fromFactionId", "toFactionId", "createdAt");
