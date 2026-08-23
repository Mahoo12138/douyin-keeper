import Stripe from 'stripe'

export default defineEventHandler(async (event) => {
  try {
    const runtimeConfig = useRuntimeConfig()
    const config = (await import('@config')).config
    
    const stripe = new Stripe(config.payment.providers.stripe.secretKey, {
      apiVersion: '2025-04-30.basil',
    })

    const query = getQuery(event)
    const sessionId = query.session_id

    if (!sessionId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Session ID is required'
      })
    }

    // 1. 验证会话是否存在且有效
    const session = await stripe.checkout.sessions.retrieve(sessionId as string)
    
    if (!session || !session.payment_status) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid session'
      })
    }

    console.log('the payment', session.payment_status)
    
    // 2. 验证支付状态
    if (session.payment_status !== 'paid') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Payment not completed'
      })
    }

    return { success: true }
  } catch (error: any) {
    console.error('Session verification failed:', error)
    
    if (error.statusCode) {
      throw error
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: 'Session verification failed'
    })
  }
}) 