import { auth } from '@libs/auth'
import { createPaymentProvider } from '@libs/payment'
import { db } from '@libs/database'
import { order } from '@libs/database/schema/order'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const user = event.context.user || await (async () => {
    const headers = new Headers()
    Object.entries(getHeaders(event)).forEach(([key, value]) => {
      if (value) headers.set(key, value)
    })
    const session = await auth.api.getSession({ headers })
    return session?.user
  })()

  if (!user?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const query = getQuery(event)
  const { orderId, provider } = query

  if (!orderId) {
    throw createError({ statusCode: 400, statusMessage: 'Order ID is required' })
  }

  if (!provider) {
    throw createError({ statusCode: 400, statusMessage: 'Provider is required' })
  }

  try {
    const userOrder = await db
      .select({ id: order.id, userId: order.userId })
      .from(order)
      .where(eq(order.id, orderId as string))
      .limit(1)

    if (!userOrder.length) {
      throw createError({ statusCode: 404, statusMessage: 'Order not found' })
    }

    if (userOrder[0].userId !== user.id) {
      throw createError({ statusCode: 403, statusMessage: 'Access denied' })
    }

    if (provider === 'wechat') {
      const wechatProvider = createPaymentProvider('wechat')
      const success = await wechatProvider.closeOrder(orderId as string)

      if (success) {
        return { success: true, message: 'Order canceled successfully' }
      } else {
        throw createError({ statusCode: 500, statusMessage: 'Failed to cancel order' })
      }
    } else if (provider === 'stripe') {
      throw createError({ statusCode: 501, statusMessage: 'Canceling Stripe orders is not supported yet' })
    } else {
      throw createError({ statusCode: 400, statusMessage: 'Unsupported payment provider' })
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Error canceling order:', error)
    throw createError({ statusCode: 500, statusMessage: 'An error occurred while canceling the order' })
  }
})
