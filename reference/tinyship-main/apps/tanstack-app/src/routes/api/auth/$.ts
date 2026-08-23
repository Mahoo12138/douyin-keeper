import { createFileRoute } from '@tanstack/react-router'
import { withCfDb } from '@/lib/with-request-db'

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: withCfDb(async ({ request }) => {
        const { auth } = await import('@libs/auth')
        return await auth.handler(request)
      }),
      POST: withCfDb(async ({ request }) => {
        const { auth } = await import('@libs/auth')
        return await auth.handler(request)
      }),
    },
  },
})
