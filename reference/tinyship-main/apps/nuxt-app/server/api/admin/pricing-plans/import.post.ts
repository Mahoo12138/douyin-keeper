import { config } from '@config'
import { pricingAdminService } from '@libs/pricing'

export default defineEventHandler(async (event) => {
  assertMethod(event, 'POST')

  try {
    const count = await pricingAdminService.importFromStaticConfig(
      config.payment.plans as unknown as Record<string, any>
    )
    return { success: true, imported: count }
  } catch (error) {
    console.error('Error importing static plans:', error)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})
