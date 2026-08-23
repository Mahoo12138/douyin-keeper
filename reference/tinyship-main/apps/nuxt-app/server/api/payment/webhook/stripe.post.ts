import { createPaymentProvider } from '@libs/payment'

export default defineEventHandler(async (event) => {
  try {
    const body = await readRawBody(event, 'utf8')
    const signature = getHeader(event, 'stripe-signature')

    if (!signature) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No signature'
      })
    }

    const stripeProvider = createPaymentProvider('stripe')
    const verification = await stripeProvider.handleWebhook(body || '', signature)

    if (!verification.success) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Webhook verification failed'
      })
    }

    return { received: true }
  } catch (error: any) {
    console.error('Stripe webhook error:', error)
    
    if (error.statusCode) {
      throw error
    }
    
    throw createError({
      statusCode: 400,
      statusMessage: 'Webhook handler failed'
    })
  }
}) 