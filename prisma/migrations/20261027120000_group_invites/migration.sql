-- Group links (lib/invites): one link a host posts in a group chat. Anyone
-- holding it may sign up past INVITE_REQUIRED and pick any free empire.
-- maxUses = 1 keeps every existing row a single-use friend link.
ALTER TABLE "invites" ADD COLUMN "maxUses" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "uses" INTEGER NOT NULL DEFAULT 0;
