ALTER TABLE send_jobs DROP COLUMN dry_run;
ALTER TABLE douyin_accounts
  DROP COLUMN next_task_at,
  DROP COLUMN consecutive_fails,
  DROP COLUMN risk_until;
DROP TABLE IF EXISTS spark_tasks;
