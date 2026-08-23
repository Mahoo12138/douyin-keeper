import { createPaymentProvider } from '@libs/payment'

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const { orderId, provider } = query

    if (!orderId || !provider) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing orderId or provider'
      })
    }

    if (provider === 'wechat') {
      const wechatProvider = createPaymentProvider('wechat')
      const result = await wechatProvider.queryOrder(orderId as string)
      return result
    }

    throw createError({
      statusCode: 400,
      statusMessage: 'Unsupported provider'
    })
  } catch (error: any) {
    console.error('Payment query error:', error)
    
    if (error.statusCode) {
      throw error
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: 'Query failed'
    })
  }
}) 