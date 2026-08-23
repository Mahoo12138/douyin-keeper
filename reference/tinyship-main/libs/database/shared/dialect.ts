export type Dialect = 'pg' | 'sqlite' | 'd1'

export function getDialect(): Dialect {
  const d = process.env.DB_DIALECT || 'pg'
  if (d !== 'pg' && d !== 'sqlite' && d !== 'd1') {
    throw new Error(`Unknown DB_DIALECT: ${d}. Must be 'pg', 'sqlite', or 'd1'.`)
  }
  return d as Dialect
}

/** Returns true when the active dialect uses SQLite-compatible schemas */
export function isSqliteDialect(): boolean {
  const d = getDialect()
  return d === 'sqlite' || d === 'd1'
}

/** True when the active database driver is Cloudflare D1. */
export function isD1Dialect(): boolean {
  return getDialect() === 'd1'
}

/**
 * Convert a Date to a value suitable for raw `sql` template bindings.
 * SQLite integer({ mode: 'timestamp' }) stores Unix seconds — the driver
 * only accepts primitives.  PG accepts Date objects natively.
 */
export function toSqlDate(d: Date): Date | number {
  return isSqliteDialect() ? Math.floor(d.getTime() / 1000) : d
}
