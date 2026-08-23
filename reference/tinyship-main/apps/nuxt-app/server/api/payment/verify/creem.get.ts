import { createPaymentProvider } from '@libs/payment'

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    
    // 检查是否有 signature 参数（Creem return URL 的标志）
    const signature = query.signature
    
    if (signature) {
      // 这是一个完整的 Creem return URL，使用签名验证
      const url = getRequestURL(event)
      const fullUrl = url.toString()
      const creemProvider = createPaymentProvider('creem')
      
      // 使用 verifyReturnUrl 验证签名和参数
      const verification = await creemProvider.verifyReturnUrl(fullUrl)
      
      if (!verification.isValid) {
        console.error('Creem return URL verification failed:', verification.error)
        throw createError({
          statusCode: 400,
          statusMessage: 'Invalid return URL or signature'
        })
      }
      
      // 签名验证通过，返回成功（webhook 会处理业务逻辑）
      return { 
        success: true,
        verified: true,
        params: verification.params
      }
    }
    
    // 如果没有签名，检查是否有 checkout_id（可能是手动调用）
    const checkoutId = query.session_id || query.checkout_id
    
    if (checkoutId) {
      // 没有签名的 checkout_id，无法安全验证
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing signature. Creem payments require signature verification for security.'
      })
    }
    
    // 没有任何有效参数
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing required parameters (checkout_id and signature)'
    })
  } catch (error: any) {
    console.error('Creem payment verification error:', error)
    
    if (error.statusCode) {
      throw error
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal server error'
    })
  }
}) 