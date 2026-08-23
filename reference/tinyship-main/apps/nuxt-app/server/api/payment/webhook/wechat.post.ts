import { createPaymentProvider } from '@libs/payment'

export default defineEventHandler(async (event) => {
  try {
    const body = await readRawBody(event, 'utf8')
    console.log('body', body)
    
    // 微信支付需要的签名头
    const signature = getHeader(event, 'wechatpay-signature')
    const timestamp = getHeader(event, 'wechatpay-timestamp')
    const nonce = getHeader(event, 'wechatpay-nonce')
    const serial = getHeader(event, 'wechatpay-serial')
    
    console.log('signature', signature)
    console.log('timestamp', timestamp)
    console.log('nonce', nonce)
    console.log('serial', serial)
    
    if (!signature || !timestamp || !nonce || !serial) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing required headers'
      })
    }

    const wechatProvider = createPaymentProvider('wechat')
    const verification = await wechatProvider.handleWebhook({
      headers: {
        'wechatpay-signature': signature,
        'wechatpay-timestamp': timestamp,
        'wechatpay-nonce': nonce,
        'wechatpay-serial': serial
      },
      body: body || ''
    }, signature)

    if (!verification.success) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Webhook verification failed'
      })
    }

    return { received: true }
  } catch (error: any) {
    console.error('WeChat Pay webhook error:', error)
    
    if (error.statusCode) {
      throw error
    }
    
    throw createError({
      statusCode: 400,
      statusMessage: 'Webhook handler failed'
    })
  }
}) 