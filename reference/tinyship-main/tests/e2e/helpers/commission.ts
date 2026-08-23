import { config } from 'dotenv';
import { resolve } from 'path';
import { executeLocalD1, getE2eDialect, sqlString } from './d1';

/**
 * Commission Balance Seeding Helper for E2E Tests
 *
 * Directly sets a user's commission balance via SQL.
 * Used to give test users enough balance for withdrawal tests
 * without running the full payment + referral flow.
 */

config({ path: resolve(__dirname, '../../../.env') });

export async function seedCommissionBalance(userId: string, amount: number): Promise<void> {
  const dialect = getE2eDialect();

  if (dialect === 'd1') {
    await seedCommissionBalanceD1(userId, amount);
  } else if (dialect === 'sqlite') {
    await seedCommissionBalanceSqlite(userId, amount);
  } else {
    await seedCommissionBalancePg(userId, amount);
  }
}

async function seedCommissionBalanceD1(userId: string, amount: number): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await executeLocalD1(
    `UPDATE user
     SET commission_balance = CAST(COALESCE(commission_balance, '0') AS REAL) + ${amount}, updated_at = ${now}
     WHERE id = ${sqlString(userId)}`,
  );
  console.log(`[commission] Seeded ${amount} commission balance for user ${userId} (D1)`);
}

async function seedCommissionBalancePg(userId: string, amount: number): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL not set — cannot seed commission balance.');
  }

  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    await pool.query(
      `UPDATE "user" SET commission_balance = commission_balance + $1, updated_at = NOW() WHERE id = $2`,
      [amount, userId]
    );
    console.log(`[commission] Seeded ${amount} commission balance for user ${userId}`);
  } finally {
    await pool.end();
  }
}

async function seedCommissionBalanceSqlite(userId: string, amount: number): Promise<void> {
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
      `UPDATE "user" SET commission_balance = commission_balance + ?, updated_at = ? WHERE id = ?`
    ).run(amount, now, userId);
    console.log(`[commission] Seeded ${amount} commission balance for user ${userId} (SQLite)`);
  } finally {
    db.close();
  }
}
