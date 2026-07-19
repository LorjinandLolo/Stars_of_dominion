-- AlterTable
ALTER TABLE "factions" ADD COLUMN     "economy_last_updated" TEXT,
ADD COLUMN     "income_rates" TEXT;

-- AlterTable
ALTER TABLE "planets" ADD COLUMN     "buildings" TEXT;
