import { createPaymentProvider } from '@libs/payment'

export default defineEventHandler(async (event) => {
  try {
    // Alipay sends notification as application/x-www-form-urlencoded
    const body = await readRawBody(event, 'utf8')
    console.log('Alipay webhook body:', body)
    
    if (!body) {
      // Return plain text "fail" for Alipay
      setResponseStatus(event, 200)
      return 'fail'
    }

    const alipayProvider = createPaymentProvider('alipay')
    
    // Pass the raw body and empty signature (SDK extracts sign from body)
    const verification = await alipayProvider.handleWebhook(body, '')

    if (!verification.success) {
      // Alipay requires "fail" response for failed verification
      setResponseStatus(event, 200)
      return 'fail'
    }

    // Alipay requires "success" response (plain text)
    return 'success'
  } catch (error: any) {
    console.error('Alipay webhook error:', error)
    // Return "fail" so Alipay will retry
    setResponseStatus(event, 200)
    return 'fail'
  }
})
