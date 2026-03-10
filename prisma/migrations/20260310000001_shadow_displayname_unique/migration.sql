-- Add partial unique index to prevent duplicate unclaimed shadow profiles with the same displayName (case-insensitive)
CREATE UNIQUE INDEX "Player_shadow_displayname_unique"
ON "Player" (lower("displayName"))
WHERE "userId" IS NULL AND "claimed" = false AND "deletedAt" IS NULL;
