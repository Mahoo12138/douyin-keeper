import { pricingAdminService } from '@libs/pricing'
import type { CreatePlanInput } from '@libs/pricing'

export default defineEventHandler(async (event) => {
  assertMethod(event, 'POST')

  try {
    const body = await readBody(event) as CreatePlanInput

    if (!body.provider || !body.amount || !body.currency || !body.durationType || !body.i18n) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing required fields: provider, amount, currency, durationType, i18n'
      })
    }

    const plan = await pricingAdminService.createPlan(body)
    return { plan }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Error creating pricing plan:', error)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})
