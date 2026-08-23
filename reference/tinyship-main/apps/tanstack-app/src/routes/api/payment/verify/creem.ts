import { createFileRoute } from '@tanstack/react-router'
import { withCfDb } from '@/lib/with-request-db'

export const Route = createFileRoute('/api/payment/verify/creem')({
  server: {
    handlers: {
      GET: withCfDb(async ({ request }) => {
        try {
          const { createPaymentProvider } = await import('@libs/payment')

          const url = new URL(request.url)
          const signature = url.searchParams.get('signature')

          if (signature) {
            const creemProvider = createPaymentProvider('creem')
            const verification = await creemProvider.verifyReturnUrl(request.url)
            if (!verification.isValid) {
              console.error('Creem return URL verification failed:', verification.error)
              return Response.json({ error: 'Invalid return URL or signature' }, { status: 400 })
            }
            return Response.json({ success: true, verified: true, params: verification.params })
          }

          const checkoutId = url.searchParams.get('session_id') || url.searchParams.get('checkout_id')
          if (checkoutId) return Response.json({ error: 'Missing signature. Creem payments require signature verification for security.' }, { status: 400 })

          return Response.json({ error: 'Missing required parameters (checkout_id and signature)' }, { status: 400 })
        } catch (error) {
          console.error('Creem payment verification error:', error)
          return Response.json({ error: 'Internal server error' }, { status: 500 })
        }
      }),
      POST: withCfDb(async ({ request }) => {
        try {
          const { createPaymentProvider } = await import('@libs/payment')

          const body = await request.json()
          const { returnUrl } = body
          if (!returnUrl) return Response.json({ error: 'Missing returnUrl parameter' }, { status: 400 })

          const creemProvider = createPaymentProvider('creem')
          const verification = await creemProvider.verifyReturnUrl(returnUrl)
          return Response.json(verification)
        } catch (error) {
          console.error('Creem payment verification error:', error)
          return Response.json({ error: 'Internal server error' }, { status: 500 })
        }
      }),
    },
  },
})
