import { drizzle } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'
import * as path from 'path'
import * as schema from '../schema/sqlite'

export const isWorkersRuntime = false

/**
 * Resolve the SQLite database file path.
 * Uses SQLITE_DB_PATH env var, or defaults to `data/local.sqlite` in the monorepo root.
 * Walks up from cwd looking for pnpm-workspace.yaml to find the monorepo root,
 * so the path is stable regardless of which app starts (next/nuxt/tanstack).
 */
export function getSqlitePath(): string {
  if (process.env.SQLITE_DB_PATH) {
    return path.resolve(process.env.SQLITE_DB_PATH)
  }
  // Walk up from cwd to find monorepo root (pnpm-workspace.yaml)
  const fs = require('fs') as typeof import('fs')
  let dir = process.cwd()
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return path.resolve(dir, 'data', 'local.sqlite')
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return path.resolve(process.cwd(), 'data', 'local.sqlite')
}

function ensureDirectory(filePath: string) {
  const dir = path.dirname(filePath)
  const fs = require('fs')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

const dbPath = getSqlitePath()
ensureDirectory(dbPath)

const sqlite = new Database(dbPath)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

console.log('[db] using SQLite file:', dbPath)
console.log('[db] query strategy:', 'better-sqlite3 (synchronous)')

export const db = drizzle(sqlite, { schema })

// Expose the raw better-sqlite3 instance for direct access (e.g. check-connection)
export const sqliteInstance = sqlite

// Stubs for PG-specific APIs to maintain interface compatibility
export const pool = undefined
export function getConnectionString(): string { return dbPath }
export async function withRequestClient<T>(fn: () => Promise<T>): Promise<T> { return fn() }
export async function withFreshRequestClient<T>(fn: () => Promise<T>): Promise<T> { return fn() }

// Query helper for backward compatibility
export const query = {
  user: {
    findFirst: async (params: { where: any }) => {
      const result = await db.select().from(schema.user).where(params.where).limit(1)
      return result[0]
    },
  },
  order: {
    findFirst: async (params: { where: any }) => {
      const result = await db.select().from(schema.order).where(params.where).limit(1)
      return result[0]
    },
  },
}

