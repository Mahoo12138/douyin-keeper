import { createFileRoute } from '@tanstack/react-router'
import { withCfDb } from '@/lib/with-request-db'

export const Route = createFileRoute('/api/payment/webhook/creem')({
  server: {
    handlers: {
      POST: withCfDb(async ({ request }) => {
        try {
          const { createPaymentProvider } = await import('@libs/payment')

          const rawBody = await request.text()
          const signature = request.headers.get('creem-signature') || ''
          if (!signature) return Response.json({ error: 'Missing signature' }, { status: 400 })

          const provider = createPaymentProvider('creem')
          const result = await provider.handleWebhook(rawBody, signature)
          if (result.success) return Response.json({ success: true }, { status: 200 })
          return Response.json({ error: 'Webhook processing failed' }, { status: 400 })
        } catch (error) {
          console.error('Creem webhook error:', error)
          return Response.json({ error: 'Internal server error' }, { status: 500 })
        }
      }),
    },
  },
})
