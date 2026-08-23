import { createFileRoute } from '@tanstack/react-router'
import { withCfDb } from '@/lib/with-request-db'

export const Route = createFileRoute('/api/payment/webhook/dodo')({
  server: {
    handlers: {
      POST: withCfDb(async ({ request }) => {
        const body = await request.text()
        const webhookId = request.headers.get('webhook-id')
        const webhookSignature = request.headers.get('webhook-signature')
        const webhookTimestamp = request.headers.get('webhook-timestamp')

        if (!webhookId || !webhookSignature || !webhookTimestamp) {
          return Response.json({ error: 'Missing webhook headers' }, { status: 400 })
        }

        try {
          const { createPaymentProvider } = await import('@libs/payment')
          const dodoProvider = createPaymentProvider('dodo')
          const verification = await dodoProvider.handleWebhook(body, JSON.stringify({
            'webhook-id': webhookId,
            'webhook-signature': webhookSignature,
            'webhook-timestamp': webhookTimestamp,
          }))
          if (!verification.success) return Response.json({ error: 'Webhook verification failed' }, { status: 400 })
          return Response.json({ received: true })
        } catch (err) {
          console.error('Dodo Payments webhook error:', err)
          return Response.json({ error: 'Webhook handler failed' }, { status: 400 })
        }
      }),
    },
  },
})
