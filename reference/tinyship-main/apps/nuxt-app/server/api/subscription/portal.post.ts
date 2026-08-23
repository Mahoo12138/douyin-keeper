import { auth } from '@libs/auth'
import { db } from '@libs/database'
import { subscription } from '@libs/database/schema/subscription'
import { eq, desc } from 'drizzle-orm'
import { createPaymentProvider, StripeProvider, CreemProvider, DodoProvider } from '@libs/payment'
import { config } from '@config'

export default defineEventHandler(async (event) => {
  try {
    // Get current user session (authMiddleware已验证用户已登录)
    const user = event.context.user || await (async () => {
      const headers = new Headers()
      Object.entries(getHeaders(event)).forEach(([key, value]) => {
        if (value) headers.set(key, value)
      })
      const session = await auth.api.getSession({ headers })
      return session?.user
    })()

    const userId = user!.id

    // Get request body
    const body = await readBody(event).catch(() => ({}))
    const { provider, returnUrl: customReturnUrl } = body
    const returnUrl = customReturnUrl || `${config.app.baseUrl}/dashboard`

    // Find all user subscriptions, ordered by creation time (newest first)
    const allSubscriptions = await db.query.subscription.findMany({
      where: eq(subscription.userId, userId),
      orderBy: [desc(subscription.createdAt)]
    })

    if (allSubscriptions.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: 'No subscription found'
      })
    }
    
    // Prioritize active subscriptions, otherwise select the newest one
    const activeSubscription = allSubscriptions.find(sub => sub.status === 'active') || 
                              allSubscriptions.find(sub => sub.status === 'paid') ||
                              allSubscriptions[0]

    // Guard against undefined (shouldn't happen due to length check above)
    if (!activeSubscription) {
      throw createError({
        statusCode: 404,
        statusMessage: 'No subscription found'
      })
    }

    console.log('activeSubscription', activeSubscription)

    // Determine payment provider by specified provider or auto-detection
    let paymentProvider = provider
    
    if (!paymentProvider) {
      // Auto-detect: prioritize provider with subscription ID
      if (activeSubscription.stripeSubscriptionId || activeSubscription.stripeCustomerId) {
        paymentProvider = 'stripe'
      } else if (activeSubscription.creemSubscriptionId || activeSubscription.creemCustomerId) {
        paymentProvider = 'creem'
      } else if (activeSubscription.dodoSubscriptionId || activeSubscription.dodoCustomerId) {
        paymentProvider = 'dodo'
      } else {
        throw createError({
          statusCode: 400,
          statusMessage: 'Unable to determine payment provider'
        })
      }
    }

    console.log('detected paymentProvider: 123', paymentProvider)

    // Handle different payment providers
    if (paymentProvider === 'stripe') {
      if (!activeSubscription.stripeCustomerId) {
        throw createError({
          statusCode: 404,
          statusMessage: 'Stripe customer information not found'
        })
      }

      const stripeProvider = createPaymentProvider('stripe') as StripeProvider
      const portalSession = await stripeProvider.createCustomerPortal(
        activeSubscription.stripeCustomerId,
        returnUrl
      )

      return { url: portalSession.url }
    } 
    else if (paymentProvider === 'creem') {
      if (!activeSubscription.creemCustomerId) {
        throw createError({
          statusCode: 404,
          statusMessage: 'Creem customer information not found'
        })
      }

      const creemProvider = createPaymentProvider('creem') as CreemProvider
      const portalSession = await creemProvider.createCreemCustomerPortal(
        activeSubscription.creemCustomerId,
        returnUrl
      )

      return { url: portalSession.url }
    }
    else if (paymentProvider === 'dodo') {
      if (!activeSubscription.dodoCustomerId) {
        throw createError({
          statusCode: 404,
          statusMessage: 'Dodo customer information not found'
        })
      }

      const dodoProvider = createPaymentProvider('dodo') as DodoProvider
      const portalSession = await dodoProvider.createDodoCustomerPortal(
        activeSubscription.dodoCustomerId,
        returnUrl
      )

      return { url: portalSession.url }
    }
    else {
      throw createError({
        statusCode: 400,
        statusMessage: `Unsupported payment provider: ${paymentProvider}`
      })
    }

  } catch (error: any) {
    console.error('Failed to create customer portal session:', error)
    
    if (error.statusCode) {
      throw error
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create portal session'
    })
  }
})