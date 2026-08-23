import { createPaymentProvider } from '@libs/payment'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { returnUrl } = body
    
    if (!returnUrl) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing returnUrl parameter'
      })
    }
    
    const creemProvider = createPaymentProvider('creem')
    const verification = await creemProvider.verifyReturnUrl(returnUrl)
    
    return verification
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