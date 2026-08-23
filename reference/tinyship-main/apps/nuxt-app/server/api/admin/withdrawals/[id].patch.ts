import { auth } from '@libs/auth'
import { processWithdrawal } from '@libs/affiliate'

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
    const withdrawalId = getRouterParam(event, 'id')
    if (!withdrawalId) {
      throw createError({ statusCode: 400, statusMessage: 'Withdrawal ID is required' })
    }

    const body = await readBody(event)
    const { status, adminNote } = body

    if (!status || !['processing', 'completed', 'rejected'].includes(status)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid status' })
    }

    const result = await processWithdrawal({
      withdrawalId,
      status,
      adminNote,
      processedBy: currentUser.id,
    })

    if (!result.success) {
      throw createError({ statusCode: 400, statusMessage: result.error || 'Processing failed' })
    }

    return result
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to process withdrawal:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to process withdrawal' })
  }
})
