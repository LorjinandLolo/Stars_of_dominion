-- AlterTable
ALTER TABLE "chronicle_events" ADD COLUMN     "actorNames" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "targetNames" TEXT NOT NULL DEFAULT '[]';
