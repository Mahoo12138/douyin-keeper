import { createPaymentProvider } from '@libs/payment'
import { auth } from '@libs/auth'
import { nanoid } from 'nanoid'
import { db } from '@libs/database'
import { order, orderStatus, paymentProviders } from '@libs/database/schema'
import { eq } from 'drizzle-orm'
import { getPurchasablePlanById } from '@libs/pricing'

// Order expiration time (2 hours)
const ORDER_EXPIRATION_TIME = 2 * 60 * 60 * 1000

export default defineEventHandler(async (event) => {
  try {
    // Get current user session (authMiddleware已验证用户已登录)
    const user = event.context.user || await (async () => {
      const headers = new Headers()
      for (const [key, value] of Object.entries(getHeaders(event))) {
        if (value) headers.set(key, value)
      }
      
      const session = await auth.api.getSession({ headers })
      return session?.user
    })()

    // Parse request body
    const body = await readBody(event)
    const { planId, provider = 'stripe' } = body

    if (!planId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Plan ID is required'
      })
    }

    // Generate order ID and get plan details
    const orderId = nanoid()
    const plan = await getPurchasablePlanById(planId)
    
    if (!plan) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid plan'
      })
    }

    // Build referral metadata for commission tracking
    const orderMetadata: Record<string, string> = {};
    try {
      const { user: userTable } = await import('@libs/database/schema');
      const { eq } = await import('drizzle-orm');
      const userRecord = await db.select({ referredByCode: userTable.referredByCode }).from(userTable).where(eq(userTable.id, user!.id)).limit(1);
      const referralCode = userRecord[0]?.referredByCode;
      if (referralCode) {
        const referrer = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.referralCode, referralCode)).limit(1);
        if (referrer.length && referrer[0].id !== user!.id) {
          orderMetadata.referralCode = referralCode;
          orderMetadata.referrerId = referrer[0].id;
        }
      }
    } catch (e) {
      console.warn('[Payment] Failed to resolve referral metadata:', e);
    }

    // Create order record in database
    await db.insert(order).values({
      id: orderId,
      userId: user!.id,
      planId,
      amount: plan.amount.toString(),
      currency: plan.currency,
      status: orderStatus.PENDING,
      provider,
      metadata: orderMetadata,
      createdAt: new Date(),
      updatedAt: new Date()
    })
    console.log('Order created:', orderId)

    // Set up order expiration handler
    setTimeout(async () => {
      try {
        // Query order status
        const currentOrder = await db.query.order.findFirst({
          where: eq(order.id, orderId)
        })

        // Only process orders that are still in pending status
        if (currentOrder?.status === orderStatus.PENDING) {
          // Update order status to canceled
          await db.update(order)
            .set({ 
              status: orderStatus.CANCELED,
              updatedAt: new Date()
            })
            .where(eq(order.id, orderId))
          
          console.log(`Order ${orderId} expired and canceled`)
          
          // For WeChat Pay, call the close order API
          if (provider === paymentProviders.WECHAT) {
            const paymentProvider = createPaymentProvider('wechat')
            await paymentProvider.closeOrder(orderId)
          }
        }
      } catch (error) {
        console.error(`Failed to process expired order ${orderId}:`, error)
      }
    }, ORDER_EXPIRATION_TIME)

    // Create payment provider instance
    const paymentProvider = createPaymentProvider(provider)

    // Get client IP
    // x-forwarded-for may contain multiple IPs (comma-separated), we only need the first one
    // WeChat Pay requires payer_client_ip to be max 45 bytes
    const forwardedFor = getHeader(event, 'x-forwarded-for')
    const realIp = getHeader(event, 'x-real-ip')
    const clientIp = forwardedFor 
      ? (forwardedFor.split(',')[0]?.trim() ?? '127.0.0.1')
      : (realIp || '127.0.0.1')
    
    // Initiate payment using the payment library
    const result = await paymentProvider.createPayment({
      orderId,
      userId: user!.id,
      planId,
      amount: plan.amount,
      currency: plan.currency,
      plan,
      metadata: {
        clientIp
        // description: `${plan.name} - ${plan.duration.description}`
      }
    })
    // Merge provider metadata with referral metadata (avoid overwriting referral info)
    await db.update(order)
      .set({
        providerOrderId: result.providerOrderId,
        metadata: { ...orderMetadata, ...(result.metadata || {}) },
        updatedAt: new Date()
      })
      .where(eq(order.id, orderId))

    console.log('Payment initiation result:', result)

    return {
      paymentUrl: result.paymentUrl,
      providerOrderId: result.providerOrderId,
      metadata: result.metadata
    }
  } catch (error: any) {
    console.error('Payment initiate error:', error)
    
    if (error.statusCode) {
      throw error
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal server error'
    })
  }
}) 
