/**
 * Database Configuration
 */
import { getEnv, requireEnvForService } from './utils';

export type DatabaseDialect = 'pg' | 'sqlite' | 'd1';

const DEFAULT_PG_URL = 'postgresql://username:password@localhost:5432/database_name';
const DEFAULT_SQLITE_PATH = './data/local.sqlite';

function parseDialect(): DatabaseDialect {
  const value = getEnv('DB_DIALECT') ?? 'pg';
  if (value !== 'pg' && value !== 'sqlite' && value !== 'd1') {
    throw new Error(`Invalid DB_DIALECT: ${value}. Expected "pg", "sqlite", or "d1".`);
  }
  return value;
}

export const databaseConfig = {
  /**
   * Active database dialect.
   */
  get dialect(): DatabaseDialect {
    return parseDialect();
  },

  /**
   * Whether the current dialect uses SQLite-compatible schemas.
   */
  get usesSqlite(): boolean {
    return this.dialect === 'sqlite' || this.dialect === 'd1';
  },

  /**
   * PostgreSQL connection string.
   * Required only when dialect is `pg`.
   */
  get pgUrl(): string | undefined {
    if (this.dialect !== 'pg') return undefined;
    return requireEnvForService('DATABASE_URL', 'Database', DEFAULT_PG_URL);
  },

  /**
   * Local SQLite file path.
   * Used only when dialect is `sqlite`.
   */
  get sqlitePath(): string {
    return getEnv('SQLITE_DB_PATH') || DEFAULT_SQLITE_PATH;
  },

  /**
   * Cloudflare D1 binding name.
   * Default follows current app conventions.
   */
  get d1BindingName(): string {
    return getEnv('D1_BINDING_NAME') || 'DB';
  },

  /**
   * Backward-compatible database endpoint accessor.
   * - `pg` returns DATABASE_URL
   * - `sqlite`/`d1` returns sqlitePath
   */
  get url() {
    if (this.dialect === 'pg') {
      return requireEnvForService('DATABASE_URL', 'Database', DEFAULT_PG_URL);
    }
    return this.sqlitePath;
  },
} as const;
