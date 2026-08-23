import { withRequestClient, withD1, getDialect, setHyperdriveBinding, isWorkersRuntime } from '@libs/database'

async function getD1Binding(): Promise<any> {
  const { env } = await import('cloudflare:workers')
  const binding = (env as any).DB
  if (!binding) {
    throw new Error('D1 binding "DB" not found. Check wrangler.jsonc d1_databases config.')
  }
  return binding
}

async function injectHyperdrive(): Promise<void> {
  if (getDialect() !== 'pg') return
  if (!isWorkersRuntime) return
  try {
    const { env } = await import('cloudflare:workers')
    const hyperdrive = (env as any).HYPERDRIVE
    if (hyperdrive) {
      setHyperdriveBinding(hyperdrive)
      return
    }
    if (process.env.CF_FORCE_DIRECT_DB !== '1') {
      console.warn(
        '[with-request-db] HYPERDRIVE binding missing in Workers PG mode; falling back to DATABASE_URL.',
      )
    }
  } catch (error) {
    console.error(
      '[with-request-db] Failed to inject HYPERDRIVE binding; falling back to DATABASE_URL.',
      error,
    )
  }
}

/**
 * Wraps a TanStack API route handler so that all DB operations
 * within a single HTTP request share one connection.
 *
 * - pg: injects Hyperdrive binding, then uses withRequestClient
 * - sqlite: uses withRequestClient (no-op passthrough)
 * - d1: injects the D1 binding from Cloudflare Workers env
 */
export function withCfDb<T extends { request: Request }>(
  handler: (ctx: T) => Promise<Response>,
): (ctx: T) => Promise<Response> {
  if (getDialect() === 'd1') {
    return async (ctx: T) => {
      const d1Binding = await getD1Binding()
      return withD1!(d1Binding, () => handler(ctx))
    }
  }
  return async (ctx: T) => {
    await injectHyperdrive()
    return withRequestClient(() => handler(ctx))
  }
}

/**
 * Wraps an async function with the appropriate DB context for
 * createServerFn handlers.
 *
 * - pg: injects Hyperdrive binding, then uses withRequestClient
 * - sqlite: uses withRequestClient (no-op passthrough)
 * - d1: extracts D1 binding from Cloudflare Workers env
 */
export async function withDbContext<T>(fn: () => Promise<T>): Promise<T> {
  if (getDialect() === 'd1') {
    const d1Binding = await getD1Binding()
    return withD1!(d1Binding, fn)
  }
  await injectHyperdrive()
  return withRequestClient(fn)
}
