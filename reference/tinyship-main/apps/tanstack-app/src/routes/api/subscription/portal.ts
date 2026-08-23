import { createFileRoute } from '@tanstack/react-router'
import { withCfDb } from '@/lib/with-request-db'
import { config } from '@config'

export const Route = createFileRoute('/api/subscription/portal')({
  server: {
    handlers: {
      POST: withCfDb(async ({ request }) => {
        try {
          const { auth } = await import('@libs/auth')
          const { db } = await import('@libs/database')
          const { subscription } = await import('@libs/database/schema/subscription')
          const { eq, desc } = await import('drizzle-orm')
          const { createPaymentProvider } = await import('@libs/payment')

          const session = await auth.api.getSession({ headers: new Headers(request.headers) })
          if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

          const userId = session.user.id
          const body = await request.json().catch(() => ({}))
          const { provider, returnUrl: customReturnUrl } = body
          const returnUrl = customReturnUrl || `${config.app.baseUrl}/dashboard/subscription`

          const allSubscriptions = await db.query.subscription.findMany({
            where: eq(subscription.userId, userId),
            orderBy: [desc(subscription.createdAt)],
          })

          if (allSubscriptions.length === 0) return Response.json({ error: 'No subscription found' }, { status: 404 })

          const activeSubscription =
            allSubscriptions.find((sub) => sub.status === 'active') ||
            allSubscriptions.find((sub) => sub.status === 'paid') ||
            allSubscriptions[0]

          let paymentProvider = provider
          if (!paymentProvider) {
            if (activeSubscription.stripeSubscriptionId || activeSubscription.stripeCustomerId) paymentProvider = 'stripe'
            else if (activeSubscription.creemSubscriptionId || activeSubscription.creemCustomerId) paymentProvider = 'creem'
            else if (activeSubscription.dodoSubscriptionId || activeSubscription.dodoCustomerId) paymentProvider = 'dodo'
            else return Response.json({ error: 'Cannot determine payment provider' }, { status: 400 })
          }

          if (paymentProvider === 'stripe') {
            if (!activeSubscription.stripeCustomerId) return Response.json({ error: 'No Stripe customer found' }, { status: 404 })
            const stripeProvider = createPaymentProvider('stripe') as import('@libs/payment').StripeProvider
            const portalSession = await stripeProvider.createCustomerPortal(activeSubscription.stripeCustomerId, returnUrl)
            return Response.json({ url: portalSession.url })
          } else if (paymentProvider === 'creem') {
            if (!activeSubscription.creemCustomerId) return Response.json({ error: 'No Creem customer found' }, { status: 404 })
            const creemProvider = createPaymentProvider('creem') as import('@libs/payment').CreemProvider
            const portalSession = await creemProvider.createCreemCustomerPortal(activeSubscription.creemCustomerId, returnUrl)
            return Response.json({ url: portalSession.url })
          } else if (paymentProvider === 'dodo') {
            if (!activeSubscription.dodoCustomerId) return Response.json({ error: 'No Dodo customer found' }, { status: 404 })
            const dodoProvider = createPaymentProvider('dodo') as import('@libs/payment').DodoProvider
            const portalSession = await dodoProvider.createDodoCustomerPortal(activeSubscription.dodoCustomerId, returnUrl)
            return Response.json({ url: portalSession.url })
          } else {
            return Response.json({ error: `Unsupported payment provider: ${paymentProvider}` }, { status: 400 })
          }
        } catch (error) {
          console.error('Failed to create customer portal session:', error)
          return Response.json({ error: 'Failed to create portal session' }, { status: 500 })
        }
      }),
    },
  },
})
