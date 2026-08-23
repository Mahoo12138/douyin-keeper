import { pricingAdminService } from '@libs/pricing'

export default defineEventHandler(async (event) => {
  assertMethod(event, 'DELETE')

  try {
    const query = getQuery(event)
    const id = query.id as string
    const hard = query.hard === 'true'

    if (!id) {
      throw createError({ statusCode: 400, statusMessage: 'Missing required query param: id' })
    }

    const success = hard
      ? await pricingAdminService.hardDeletePlan(id)
      : await pricingAdminService.deletePlan(id)

    if (!success) {
      throw createError({ statusCode: 404, statusMessage: 'Plan not found' })
    }

    return { success: true }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Error deleting pricing plan:', error)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})
