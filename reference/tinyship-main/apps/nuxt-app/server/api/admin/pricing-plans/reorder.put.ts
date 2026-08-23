import { pricingAdminService } from '@libs/pricing'

export default defineEventHandler(async (event) => {
  assertMethod(event, 'PUT')

  try {
    const body = await readBody(event)
    const { planOrders } = body as { planOrders: { id: string; sortOrder: number }[] }

    if (!planOrders || !Array.isArray(planOrders)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing required field: planOrders (array of { id, sortOrder })'
      })
    }

    await pricingAdminService.reorderPlans(planOrders)
    return { success: true }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Error reordering pricing plans:', error)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})
