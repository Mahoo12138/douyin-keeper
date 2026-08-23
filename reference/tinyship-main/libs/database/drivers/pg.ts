import { AsyncLocalStorage } from 'node:async_hooks'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool, Client } from 'pg'
import * as schema from '../schema/pg'

export const isWorkersRuntime = typeof (globalThis as any).WebSocketPair !== 'undefined'

/**
 * Legacy standalone PG driver kept for reference.
 * The active Hyperdrive injection flow lives in libs/database/index.ts.
 */
export function getConnectionString(): string {
  return process.env.DATABASE_URL!
}

function getConnectionTarget(connectionString: string): string {
  try {
    const url = new URL(connectionString)
    return `${url.protocol}//${url.hostname}:${url.port || '5432'}${url.pathname}`
  } catch {
    return 'invalid-connection-string'
  }
}

const requestClientStore = new AsyncLocalStorage<Client>()

const CF_QUERY_TIMEOUT = 12000
const CF_CONNECT_TIMEOUT = 15000

function createEphemeralClient(): Client {
  return new Client({
    connectionString: getConnectionString(),
    query_timeout: CF_QUERY_TIMEOUT,
    connectionTimeoutMillis: CF_CONNECT_TIMEOUT,
  })
}

const poolInstance = new Pool({
  connectionString: getConnectionString(),
  connectionTimeoutMillis: isWorkersRuntime ? CF_CONNECT_TIMEOUT : 3000,
  query_timeout: isWorkersRuntime ? CF_QUERY_TIMEOUT : 5000,
  idleTimeoutMillis: isWorkersRuntime ? 1500 : 10000,
  max: isWorkersRuntime ? 12 : 5,
  maxUses: isWorkersRuntime ? 1 : undefined,
  maxLifetimeSeconds: isWorkersRuntime ? 12 : undefined,
})

poolInstance.on('error', (error) => {
  console.error('[db] pool error:', error)
})

/**
 * In CF Workers the pool is proxied so that every query/connect call
 * prefers (1) a request-scoped client from ALS, or (2) an ephemeral
 * per-query Client, bypassing the pool's max-connection bottleneck.
 */
export const pool: Pool = isWorkersRuntime
  ? (new Proxy(poolInstance, {
      get(target, prop) {
        if (prop === 'query') {
          return async (...args: unknown[]) => {
            const reqClient = requestClientStore.getStore()
            if (reqClient) return (reqClient.query as Function)(...args)

            const c = createEphemeralClient()
            try {
              await c.connect()
              return await (c.query as Function)(...args)
            } finally {
              c.end().catch(() => {})
            }
          }
        }
        if (prop === 'connect') {
          return async () => {
            const reqClient = requestClientStore.getStore()
            if (reqClient) {
              return new Proxy(reqClient, {
                get(t, p) {
                  if (p === 'release') return () => {}
                  return Reflect.get(t, p, t)
                },
                set(t, p, v) {
                  return Reflect.set(t, p, v, t)
                },
              })
            }
            const c = createEphemeralClient()
            await c.connect()
            ;(c as any).release = (err?: unknown) => { c.end().catch(() => {}) }
            return c
          }
        }
        return Reflect.get(target, prop, target)
      },
    }) as unknown as Pool)
  : poolInstance

console.log('[db] using connection target:', getConnectionTarget(getConnectionString()))
console.log(
  '[db] connection source:',
  process.env.CF_FORCE_DIRECT_DB === '1' && process.env.DATABASE_URL
    ? 'DATABASE_URL(forced)'
    : 'DATABASE_URL(initial)',
)
console.log('[db] query strategy:', isWorkersRuntime ? 'request-scoped-client' : 'shared-pool')

export const db = drizzle(pool, { schema })

/**
 * Wraps fn with a per-request pg.Client stored in AsyncLocalStorage.
 * All DB queries executed inside fn (including those from shared libs
 * like auth/credits/payment) automatically reuse this single connection.
 *
 * No-op passthrough in non-Workers environments or when already nested.
 */
export async function withRequestClient<T>(fn: () => Promise<T>): Promise<T> {
  if (!isWorkersRuntime) return fn()
  if (requestClientStore.getStore()) return fn()

  const client = createEphemeralClient()
  try {
    await client.connect()
    return await requestClientStore.run(client, fn)
  } finally {
    client.end().catch(() => {})
  }
}

/**
 * Like withRequestClient but always creates a fresh pg.Client, even when an
 * existing one is already in the ALS store. Use this for deferred work that
 * runs after the original request-scoped client has been closed.
 */
export async function withFreshRequestClient<T>(fn: () => Promise<T>): Promise<T> {
  if (!isWorkersRuntime) return fn()

  const client = createEphemeralClient()
  try {
    await client.connect()
    return await requestClientStore.run(client, fn)
  } finally {
    client.end().catch(() => {})
  }
}

// Query helper for backward compatibility.
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
