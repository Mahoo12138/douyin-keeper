import { pricingAdminService } from '@libs/pricing'
import { config } from '@config'

export default defineEventHandler(async (event) => {
  assertMethod(event, 'GET')

  try {
    const plans = await pricingAdminService.getAllPlans()
    return { plans, pricingMode: config.payment.pricingMode }
  } catch (error) {
    console.error('Error fetching pricing plans:', error)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})
