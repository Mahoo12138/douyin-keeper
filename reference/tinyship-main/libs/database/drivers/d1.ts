import { AsyncLocalStorage } from 'node:async_hooks'
import { drizzle } from 'drizzle-orm/d1'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import * as schema from '../schema/sqlite'

export const isWorkersRuntime = true

type D1Binding = any // D1Database from @cloudflare/workers-types

const d1Store = new AsyncLocalStorage<D1Binding>()

function getDb(): DrizzleD1Database<typeof schema> {
  const binding = d1Store.getStore()
  if (!binding) {
    throw new Error(
      '[db/d1] D1 binding not available. ' +
      'Wrap your handler with withD1(binding, fn) before accessing the database.'
    )
  }
  return drizzle(binding, { schema })
}

/**
 * Proxy-based db export. Accessing any property on `db` lazily
 * creates a drizzle-d1 instance from the ALS-stored D1 binding.
 * This allows `import { db } from '@libs/database'` to work
 * transparently in D1 mode.
 */
export const db = new Proxy({} as DrizzleD1Database<typeof schema>, {
  get(_, prop) {
    return Reflect.get(getDb(), prop)
  }
})

/**
 * Wraps an async function with a D1 binding stored in AsyncLocalStorage.
 * All database access inside `fn` will use this binding.
 *
 * @param binding - The D1Database binding from Cloudflare Workers env
 * @param fn - The async function to execute with D1 access
 */
export async function withD1<T>(binding: D1Binding, fn: () => Promise<T>): Promise<T> {
  return d1Store.run(binding, fn)
}

// No-op stubs for PG-specific APIs to maintain interface compatibility
export const pool = undefined
export function getConnectionString(): string { return '' }
export async function withRequestClient<T>(fn: () => Promise<T>): Promise<T> { return fn() }
export async function withFreshRequestClient<T>(fn: () => Promise<T>): Promise<T> { return fn() }

// Query helper for backward compatibility (uses the proxied db)
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

