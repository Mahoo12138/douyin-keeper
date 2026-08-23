import { createPaymentProvider } from '@libs/payment'

export default defineEventHandler(async (event) => {
  try {
    const rawBody = await readRawBody(event, 'utf8')
    
    // 从请求头中提取 Creem 签名
    const signature = getHeader(event, 'creem-signature') || ''
    
    if (!signature) {
      console.error('Missing creem-signature header')
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing signature'
      })
    }
    
    const provider = createPaymentProvider('creem')
    const result = await provider.handleWebhook(rawBody || '', signature)
    
    if (result.success) {
      return { success: true }
    } else {
      throw createError({
        statusCode: 400,
        statusMessage: 'Webhook processing failed'
      })
    }
  } catch (error: any) {
    console.error('Creem webhook error:', error)
    
    if (error.statusCode) {
      throw error
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal server error'
    })
  }
}) 