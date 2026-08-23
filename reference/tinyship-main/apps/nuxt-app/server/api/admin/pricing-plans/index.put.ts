import { pricingAdminService } from '@libs/pricing'
import type { UpdatePlanInput } from '@libs/pricing'

export default defineEventHandler(async (event) => {
  assertMethod(event, 'PUT')

  try {
    const body = await readBody(event) as UpdatePlanInput

    if (!body.id) {
      throw createError({ statusCode: 400, statusMessage: 'Missing required field: id' })
    }

    const plan = await pricingAdminService.updatePlan(body)
    if (!plan) {
      throw createError({ statusCode: 404, statusMessage: 'Plan not found' })
    }

    return { plan }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Error updating pricing plan:', error)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})
