/**
 * Playwright Global Teardown
 *
 * Runs after all E2E tests finish.
 * Deletes test users (email matching `e2e-*@example.com`) from the database.
 *
 * All related records (account, session, order, subscription, credit_transaction)
 * are cascade-deleted automatically thanks to `onDelete: 'cascade'` foreign keys.
 *
 * Supports both PostgreSQL and SQLite dialects via DB_DIALECT env var.
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { executeLocalD1, getE2eDialect, sqlString } from './helpers/d1';

// Load .env from the project root so DATABASE_URL / DB_DIALECT are available
config({ path: resolve(__dirname, '../../.env') });

const E2E_EMAIL_PATTERN = 'e2e-%@example.com';

export default async function globalTeardown() {
  if (process.env.E2E_SKIP_CLEANUP === 'true') {
    console.log('[teardown] E2E_SKIP_CLEANUP=true — skipping test user cleanup.');
    return;
  }

  const dialect = getE2eDialect();

  if (dialect === 'd1') {
    await cleanupD1();
  } else if (dialect === 'sqlite') {
    await cleanupSqlite();
  } else {
    await cleanupPostgres();
  }
}

async function cleanupD1() {
  try {
    await executeLocalD1(`DELETE FROM user WHERE email LIKE ${sqlString(E2E_EMAIL_PATTERN)}`);
    console.log('[teardown] Cleaned up local D1 E2E test users.');
  } catch (error) {
    console.error('[teardown] Failed to clean up test users (D1):', error);
  }
}

async function cleanupPostgres() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.warn('[teardown] DATABASE_URL not set — skipping test user cleanup.');
    return;
  }

  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const result = await pool.query(
      `DELETE FROM "user" WHERE email LIKE $1`,
      [E2E_EMAIL_PATTERN]
    );

    const count = result.rowCount ?? 0;
    if (count > 0) {
      console.log(`[teardown] Cleaned up ${count} E2E test user(s).`);
    } else {
      console.log('[teardown] No E2E test users to clean up.');
    }
  } catch (error) {
    console.error('[teardown] Failed to clean up test users:', error);
  } finally {
    await pool.end();
  }
}

async function cleanupSqlite() {
  const rootDir = resolve(__dirname, '../..');
  const sqlitePath = resolve(
    rootDir,
    process.env.SQLITE_DB_PATH || './data/local.sqlite'
  );

  let Database: any;
  try {
    Database = (await import('better-sqlite3')).default;
  } catch {
    console.warn('[teardown] better-sqlite3 not available — skipping SQLite cleanup.');
    return;
  }

  const fs = await import('fs');
  if (!fs.existsSync(sqlitePath)) {
    console.warn(`[teardown] SQLite file not found: ${sqlitePath} — skipping cleanup.`);
    return;
  }

  const db = new Database(sqlitePath);
  try {
    const result = db.prepare(`DELETE FROM "user" WHERE email LIKE ?`).run('e2e-%@example.com');
    const count = result.changes;
    if (count > 0) {
      console.log(`[teardown] Cleaned up ${count} E2E test user(s) from SQLite.`);
    } else {
      console.log('[teardown] No E2E test users to clean up (SQLite).');
    }
  } catch (error) {
    console.error('[teardown] Failed to clean up test users (SQLite):', error);
  } finally {
    db.close();
  }
}
