import { createFileRoute } from '@tanstack/react-router'
import { withCfDb } from '@/lib/with-request-db'

export const Route = createFileRoute('/api/payment/webhook/alipay')({
  server: {
    handlers: {
      POST: withCfDb(async ({ request }) => {
        const body = await request.text()
        if (!body) return Response.json({ error: 'Empty request body' }, { status: 400 })

        try {
          const { createPaymentProvider } = await import('@libs/payment')
          const alipayProvider = createPaymentProvider('alipay')
          const verification = await alipayProvider.handleWebhook(body, '')
          if (!verification.success) return new Response('fail', { status: 200 })
          return new Response('success', { status: 200 })
        } catch (err) {
          console.error('Alipay webhook error:', err)
          return new Response('fail', { status: 200 })
        }
      }),
    },
  },
})
