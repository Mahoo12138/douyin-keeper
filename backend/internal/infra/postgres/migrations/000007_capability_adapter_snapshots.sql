-- A capability belongs to an adapter runtime. Keep Browser and Protocol
-- observations independent so one probe cannot erase the other's result.
UPDATE capability_snapshots
SET adapter = 'browser.consumer'
WHERE adapter IS NULL;

ALTER TABLE capability_snapshots
  ALTER COLUMN adapter SET DEFAULT 'browser.consumer',
  ALTER COLUMN adapter SET NOT NULL;

ALTER TABLE capability_snapshots
  DROP CONSTRAINT capability_snapshots_pkey;

ALTER TABLE capability_snapshots
  ADD PRIMARY KEY (account_id, capability, adapter);

CREATE INDEX ix_capability_snapshots_account_checked
  ON capability_snapshots(account_id, checked_at);
