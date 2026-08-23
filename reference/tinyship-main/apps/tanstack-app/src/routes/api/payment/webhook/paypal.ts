import { createFileRoute } from '@tanstack/react-router'
import { withCfDb } from '@/lib/with-request-db'

export const Route = createFileRoute('/api/payment/webhook/paypal')({
  server: {
    handlers: {
      POST: withCfDb(async ({ request }) => {
        const body = await request.text()
        const paypalTransmissionId = request.headers.get('paypal-transmission-id')
        const paypalTransmissionTime = request.headers.get('paypal-transmission-time')
        const paypalTransmissionSig = request.headers.get('paypal-transmission-sig')
        const paypalCertUrl = request.headers.get('paypal-cert-url')
        const paypalAuthAlgo = request.headers.get('paypal-auth-algo')

        if (!paypalTransmissionId || !paypalTransmissionSig) {
          return Response.json({ error: 'Missing required headers' }, { status: 400 })
        }

        try {
          const { createPaymentProvider } = await import('@libs/payment')
          const paypalProvider = createPaymentProvider('paypal')
          const signatureData = JSON.stringify({
            transmissionId: paypalTransmissionId,
            transmissionTime: paypalTransmissionTime,
            transmissionSig: paypalTransmissionSig,
            certUrl: paypalCertUrl,
            authAlgo: paypalAuthAlgo,
          })
          const verification = await paypalProvider.handleWebhook(body, signatureData)
          if (!verification.success) return Response.json({ error: 'Webhook verification failed' }, { status: 400 })
          return Response.json({ received: true })
        } catch (err) {
          console.error('PayPal webhook error:', err)
          return Response.json({ error: 'Webhook handler failed' }, { status: 400 })
        }
      }),
      GET: async () => {
        return Response.json({ status: 'PayPal webhook endpoint active' })
      },
    },
  },
})
