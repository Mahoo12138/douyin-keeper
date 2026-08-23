import { createFileRoute } from '@tanstack/react-router'
import { withCfDb } from '@/lib/with-request-db'

export const Route = createFileRoute('/api/payment/webhook/wechat')({
  server: {
    handlers: {
      POST: withCfDb(async ({ request }) => {
        const body = await request.text()
        const signature = request.headers.get('wechatpay-signature')
        const timestamp = request.headers.get('wechatpay-timestamp')
        const nonce = request.headers.get('wechatpay-nonce')
        const serial = request.headers.get('wechatpay-serial')

        if (!signature || !timestamp || !nonce || !serial) {
          return Response.json({ error: 'Missing required headers' }, { status: 400 })
        }

        try {
          const { createPaymentProvider } = await import('@libs/payment')
          const wechatProvider = createPaymentProvider('wechat')
          const verification = await wechatProvider.handleWebhook(
            { headers: { 'wechatpay-signature': signature, 'wechatpay-timestamp': timestamp, 'wechatpay-nonce': nonce, 'wechatpay-serial': serial }, body },
            signature
          )
          if (!verification.success) return Response.json({ error: 'Webhook verification failed' }, { status: 400 })
          return Response.json({ received: true })
        } catch (err) {
          console.error('WeChat Pay webhook error:', err)
          return Response.json({ error: 'Webhook handler failed' }, { status: 400 })
        }
      }),
    },
  },
})
