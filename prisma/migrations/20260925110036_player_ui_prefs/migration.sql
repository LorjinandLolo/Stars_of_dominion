-- AlterTable
ALTER TABLE "player_profiles" ADD COLUMN     "uiPrefs" TEXT;

-- Accounts that existed before the dock had tiers keep every button they had:
-- the progressive dock (casual-play spec, Item 5) is for new players only.
-- "legacy" also skips the one-time "take it back from your advisors?" prompt,
-- since nothing was ever hidden from them.
UPDATE "player_profiles" SET "uiPrefs" = '{"showEverything":true,"legacy":true,"opened":[]}' WHERE "uiPrefs" IS NULL;
