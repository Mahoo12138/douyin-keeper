import { config } from 'dotenv';
import { resolve } from 'path';
import { executeLocalD1, getE2eDialect, sqlString } from './d1';

/**
 * Credits Seeding Helper for E2E Tests
 *
 * Directly sets a user's credit balance via SQL.
 * Used in `beforeAll` to give test users enough credits
 * for AI chat / image generation tests without running
 * the full payment flow.
 *
 * Supports both PostgreSQL and SQLite dialects via DB_DIALECT env var.
 */

// Load .env from the project root
config({ path: resolve(__dirname, '../../../.env') });

/**
 * Seed credits for a user by directly updating their balance.
 * Also inserts a `bonus` transaction record for audit trail.
 */
export async function seedCredits(userId: string, amount: number): Promise<void> {
  const dialect = getE2eDialect();

  if (dialect === 'd1') {
    await seedCreditsD1(userId, amount);
  } else if (dialect === 'sqlite') {
    await seedCreditsSqlite(userId, amount);
  } else {
    await seedCreditsPg(userId, amount);
  }
}

async function seedCreditsD1(userId: string, amount: number): Promise<void> {
  const transactionId = `txn_e2e_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = Math.floor(Date.now() / 1000);
  const userIdSql = sqlString(userId);

  await executeLocalD1(
    `UPDATE user
     SET credit_balance = CAST(COALESCE(credit_balance, '0') AS REAL) + ${amount}, updated_at = ${now}
     WHERE id = ${userIdSql}`,
  );
  await executeLocalD1(
    `INSERT INTO credit_transaction (id, user_id, type, amount, balance, description, created_at)
     SELECT ${sqlString(transactionId)}, id, 'bonus', ${sqlString(amount.toString())}, credit_balance,
            'E2E test credit seeding', ${now}
     FROM user WHERE id = ${userIdSql}`,
  );
  console.log(`[credits] Seeded ${amount} credits for user ${userId} (D1)`);
}

async function seedCreditsPg(userId: string, amount: number): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL not set — cannot seed credits.');
  }

  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    await pool.query(
      `UPDATE "user" SET credit_balance = credit_balance + $1, updated_at = NOW() WHERE id = $2`,
      [amount, userId]
    );

    const txnId = `txn_e2e_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await pool.query(
      `INSERT INTO credit_transaction (id, user_id, type, amount, balance, description, created_at)
       VALUES ($1, $2, 'bonus', $3, $3, 'E2E test credit seeding', NOW())`,
      [txnId, userId, amount.toString()]
    );

    console.log(`[credits] Seeded ${amount} credits for user ${userId}`);
  } finally {
    await pool.end();
  }
}

async function seedCreditsSqlite(userId: string, amount: number): Promise<void> {
  const rootDir = resolve(__dirname, '../../..');
  const sqlitePath = resolve(
    rootDir,
    process.env.SQLITE_DB_PATH || './data/local.sqlite'
  );

  const Database = (await import('better-sqlite3')).default;
  const db = new Database(sqlitePath);

  try {
    const now = new Date().toISOString();

    db.prepare(
      `UPDATE "user" SET credit_balance = credit_balance + ?, updated_at = ? WHERE id = ?`
    ).run(amount, now, userId);

    const txnId = `txn_e2e_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    db.prepare(
      `INSERT INTO credit_transaction (id, user_id, type, amount, balance, description, created_at)
       VALUES (?, ?, 'bonus', ?, ?, 'E2E test credit seeding', ?)`
    ).run(txnId, userId, amount.toString(), amount.toString(), now);

    console.log(`[credits] Seeded ${amount} credits for user ${userId} (SQLite)`);
  } finally {
    db.close();
  }
}
