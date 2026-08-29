-- Distinguish a sync-derived default from an explicit user choice. This lets
-- a later scan enable maintenance when it first discovers a streak without
-- reopening maintenance after the user has deliberately disabled it.
ALTER TABLE friends
  ADD COLUMN IF NOT EXISTS spark_enabled_overridden BOOLEAN NOT NULL DEFAULT false;
