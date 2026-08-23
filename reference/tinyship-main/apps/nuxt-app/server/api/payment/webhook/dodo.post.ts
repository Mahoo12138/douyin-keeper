import { createPaymentProvider } from '@libs/payment'

export default defineEventHandler(async (event) => {
  try {
    const body = await readRawBody(event, 'utf8')
    const webhookId = getHeader(event, 'webhook-id')
    const webhookSignature = getHeader(event, 'webhook-signature')
    const webhookTimestamp = getHeader(event, 'webhook-timestamp')

    if (!webhookId || !webhookSignature || !webhookTimestamp) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing webhook headers'
      })
    }

    const dodoProvider = createPaymentProvider('dodo')
    const verification = await dodoProvider.handleWebhook(body || '', JSON.stringify({
      'webhook-id': webhookId,
      'webhook-signature': webhookSignature,
      'webhook-timestamp': webhookTimestamp,
    }))

    if (!verification.success) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Webhook verification failed'
      })
    }

    return { received: true }
  } catch (error: any) {
    console.error('Dodo Payments webhook error:', error)

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 400,
      statusMessage: 'Webhook handler failed'
    })
  }
})
