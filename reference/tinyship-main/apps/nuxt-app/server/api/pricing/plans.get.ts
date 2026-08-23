import { getActivePlans, getPlansForLocale } from '@libs/pricing'

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const locale = (query.locale as string) || 'en'

    const allPlans = await getActivePlans()
    const plans = getPlansForLocale(allPlans, locale)

    return { plans }
  } catch (error) {
    console.error('Error fetching pricing plans:', error)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})
