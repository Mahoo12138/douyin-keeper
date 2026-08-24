ALTER TABLE entitlement_plans
  ADD COLUMN migration_weight INTEGER NOT NULL DEFAULT 1
  CHECK (migration_weight > 0 AND migration_weight <= 1000);
