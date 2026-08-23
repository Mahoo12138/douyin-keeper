import { createPaymentProvider } from '@libs/payment'

export default defineEventHandler(async (event) => {
  try {
    const body = await readRawBody(event, 'utf8')

    const paypalTransmissionId = getHeader(event, 'paypal-transmission-id')
    const paypalTransmissionTime = getHeader(event, 'paypal-transmission-time')
    const paypalTransmissionSig = getHeader(event, 'paypal-transmission-sig')
    const paypalCertUrl = getHeader(event, 'paypal-cert-url')
    const paypalAuthAlgo = getHeader(event, 'paypal-auth-algo')

    if (!paypalTransmissionId || !paypalTransmissionSig) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing PayPal webhook headers'
      })
    }

    const paypalProvider = createPaymentProvider('paypal')
    const signatureData = JSON.stringify({
      transmissionId: paypalTransmissionId,
      transmissionTime: paypalTransmissionTime,
      transmissionSig: paypalTransmissionSig,
      certUrl: paypalCertUrl,
      authAlgo: paypalAuthAlgo
    })

    const verification = await paypalProvider.handleWebhook(body || '', signatureData)

    if (!verification.success) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Webhook verification failed'
      })
    }

    return { received: true }
  } catch (error: any) {
    console.error('PayPal webhook error:', error)

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 400,
      statusMessage: 'Webhook handler failed'
    })
  }
})
