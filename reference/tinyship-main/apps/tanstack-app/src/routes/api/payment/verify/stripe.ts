import { createFileRoute } from '@tanstack/react-router'
import { withCfDb } from '@/lib/with-request-db'
import { config } from '@config'

export const Route = createFileRoute('/api/payment/verify/stripe')({
  server: {
    handlers: {
      GET: withCfDb(async ({ request }) => {
        try {
          const Stripe = (await import('stripe')).default
          const stripe = new Stripe(config.payment.providers.stripe.secretKey, {
            apiVersion: '2025-04-30.basil',
          })

          const url = new URL(request.url)
          const sessionId = url.searchParams.get('session_id')
          if (!sessionId) return Response.json({ error: 'Session ID is required' }, { status: 400 })

          const session = await stripe.checkout.sessions.retrieve(sessionId)
          if (!session || !session.payment_status) return Response.json({ error: 'Invalid session' }, { status: 400 })
          if (session.payment_status !== 'paid') return Response.json({ error: 'Payment not completed' }, { status: 400 })

          return Response.json({ success: true })
        } catch (error) {
          console.error('Session verification failed:', error)
          return Response.json({ error: 'Session verification failed' }, { status: 500 })
        }
      }),
    },
  },
})
