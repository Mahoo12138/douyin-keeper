import { auth } from '@libs/auth'
import { requestWithdrawal } from '@libs/affiliate'
import { withdrawalRequestSchema } from '@libs/validators'

export default defineEventHandler(async (event) => {
  const currentUser = event.context.user || await (async () => {
    const headers = new Headers()
    Object.entries(getHeaders(event)).forEach(([key, value]) => {
      if (value) headers.set(key, value)
    })
    const session = await auth.api.getSession({ headers })
    return session?.user
  })()

  if (!currentUser?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  try {
    const parsed = withdrawalRequestSchema.safeParse(await readBody(event))
    if (!parsed.success) {
      throw createError({
        statusCode: 400,
        statusMessage: parsed.error.issues[0]?.message || 'Invalid request',
      })
    }

    const { amount, paymentMethod, paymentAccount } = parsed.data

    const result = await requestWithdrawal({
      userId: currentUser.id,
      amount,
      paymentMethod,
      paymentAccount,
    })

    if (!result.success) {
      throw createError({ statusCode: 400, statusMessage: result.error || 'Withdrawal failed' })
    }

    return result
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to request withdrawal:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to request withdrawal' })
  }
})
