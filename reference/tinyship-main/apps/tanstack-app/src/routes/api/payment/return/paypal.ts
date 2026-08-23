import { createFileRoute } from '@tanstack/react-router'
import { withCfDb } from '@/lib/with-request-db'
import type { PaymentPlan } from '@libs/payment'
import { config } from '@config'

function redirect(url: string) {
  return new Response(null, { status: 302, headers: { Location: url } })
}

export const Route = createFileRoute('/api/payment/return/paypal')({
  server: {
    handlers: {
      GET: withCfDb(async ({ request }) => {
        const { createPaymentProvider } = await import('@libs/payment')
        const { db } = await import('@libs/database')
        const { order, orderStatus } = await import('@libs/database/schema/order')
        const { subscription, subscriptionStatus, paymentTypes } = await import('@libs/database/schema/subscription')
        const { eq, and, desc } = await import('drizzle-orm')
        const { creditService, TransactionTypeCode } = await import('@libs/credits')
        const { randomUUID } = await import('crypto')
        const { utcNow } = await import('@libs/database/utils/utc')

        const url = new URL(request.url)
        const orderId = url.searchParams.get('order_id')
        const isSubscription = url.searchParams.get('subscription') === 'true'

        if (!orderId) return redirect(`${config.app.payment.cancelUrl}?provider=paypal`)

        if (isSubscription) {
          try {
            const orderRecord = await db.query.order.findFirst({ where: eq(order.id, orderId) })
            if (!orderRecord?.providerOrderId) return redirect(`${config.app.payment.cancelUrl}?provider=paypal&order_id=${orderId}`)

            const paypalProvider = createPaymentProvider('paypal')
            const subscriptionDetails = await paypalProvider.getSubscription(orderRecord.providerOrderId)

            if (subscriptionDetails?.status === 'ACTIVE') {
              const now = utcNow()
              const updatedOrders = await db
                .update(order)
                .set({ status: orderStatus.PAID, updatedAt: now })
                .where(and(eq(order.id, orderId), eq(order.status, orderStatus.PENDING)))
                .returning({ id: order.id })

              if (updatedOrders.length > 0) {
                let periodEnd = new Date(now)
                if (subscriptionDetails.billing_info?.next_billing_time) {
                  periodEnd = new Date(subscriptionDetails.billing_info.next_billing_time)
                } else {
                  const plan = config.payment.plans[orderRecord.planId as keyof typeof config.payment.plans] as PaymentPlan
                  const months = plan.duration.months ?? 1
                  periodEnd.setMonth(periodEnd.getMonth() + months)
                }

                const existingSub = await db.query.subscription.findFirst({
                  where: eq(subscription.paypalSubscriptionId, orderRecord.providerOrderId),
                })

                if (existingSub) {
                  await db
                    .update(subscription)
                    .set({
                      status: subscriptionStatus.ACTIVE,
                      periodStart: now,
                      periodEnd,
                      updatedAt: now,
                      metadata: JSON.stringify({ ...JSON.parse(existingSub.metadata || '{}'), paypalPlanId: subscriptionDetails.plan_id, processedBy: 'return' }),
                    })
                    .where(eq(subscription.id, existingSub.id))
                } else {
                  await db.insert(subscription).values({
                    id: randomUUID(),
                    userId: orderRecord.userId,
                    planId: orderRecord.planId,
                    status: subscriptionStatus.ACTIVE,
                    paymentType: paymentTypes.RECURRING,
                    paypalSubscriptionId: orderRecord.providerOrderId,
                    periodStart: now,
                    periodEnd,
                    cancelAtPeriodEnd: false,
                    metadata: JSON.stringify({ paypalPlanId: subscriptionDetails.plan_id, processedBy: 'return' }),
                  })
                }
              }
            }
          } catch (error) {
            console.error('PayPal return subscription check error:', error)
          }
          return redirect(`${config.app.payment.successUrl}?provider=paypal&order_id=${orderId}&subscription=true`)
        }

        try {
          const orderRecord = await db.query.order.findFirst({ where: eq(order.id, orderId) })
          if (!orderRecord?.providerOrderId) return redirect(`${config.app.payment.cancelUrl}?provider=paypal&order_id=${orderId}`)
          if (orderRecord.status === orderStatus.PAID) return redirect(`${config.app.payment.successUrl}?provider=paypal&order_id=${orderId}&paypal_capture=success`)

          const paypalProvider = createPaymentProvider('paypal')
          const captureResult = await paypalProvider.captureOrder(orderRecord.providerOrderId)
          if (captureResult.status !== 'COMPLETED') return redirect(`${config.app.payment.cancelUrl}?provider=paypal&order_id=${orderId}`)

          const captureNow = utcNow()
          const captureId = captureResult.purchase_units?.[0]?.payments?.captures?.[0]?.id
          const existingMetadata = (() => {
            if (!orderRecord.metadata) return {}
            if (typeof orderRecord.metadata === 'object') return orderRecord.metadata as Record<string, unknown>
            if (typeof orderRecord.metadata === 'string') { try { return JSON.parse(orderRecord.metadata) } catch { return {} } }
            return {}
          })()

          const updatedOrders = await db
            .update(order)
            .set({ status: orderStatus.PAID, metadata: { ...existingMetadata, paypalCaptureId: captureId, capturedAt: captureNow.toISOString() }, updatedAt: captureNow })
            .where(and(eq(order.id, orderId), eq(order.status, orderStatus.PENDING)))
            .returning({ id: order.id })

          if (updatedOrders.length > 0) {
            const plan = config.payment.plans[orderRecord.planId as keyof typeof config.payment.plans] as PaymentPlan | undefined

            if (plan?.duration.type === 'credits' && plan.credits) {
              await creditService.addCredits({
                userId: orderRecord.userId,
                amount: plan.credits,
                type: 'purchase',
                orderId,
                description: TransactionTypeCode.PURCHASE,
                metadata: { paypalCaptureId: captureId, planId: orderRecord.planId, provider: 'paypal' },
              })
            } else if (plan?.duration.type === 'one_time') {
              const now = utcNow()
              const months = plan.duration.months ?? 1

              const existingSub = await db.query.subscription.findFirst({
                where: and(eq(subscription.userId, orderRecord.userId), eq(subscription.planId, orderRecord.planId), eq(subscription.status, subscriptionStatus.ACTIVE)),
                orderBy: [desc(subscription.periodEnd)],
              })

              if (existingSub) {
                const extensionStart = existingSub.periodEnd > now ? existingSub.periodEnd : now
                const extensionEnd = new Date(extensionStart)
                if (months >= 9999) extensionEnd.setFullYear(extensionEnd.getFullYear() + 100)
                else extensionEnd.setMonth(extensionEnd.getMonth() + months)
                await db
                  .update(subscription)
                  .set({ periodEnd: extensionEnd, updatedAt: now, metadata: JSON.stringify({ ...JSON.parse(existingSub.metadata || '{}'), renewed: true, lastPaypalCaptureId: captureId, lastOrderId: orderId, lastPaymentTime: now.toISOString(), isLifetime: months >= 9999, provider: 'paypal' }) })
                  .where(eq(subscription.id, existingSub.id))
              } else {
                const periodEnd = new Date(now)
                if (months >= 9999) periodEnd.setFullYear(periodEnd.getFullYear() + 100)
                else periodEnd.setMonth(periodEnd.getMonth() + months)
                await db.insert(subscription).values({
                  id: randomUUID(),
                  userId: orderRecord.userId,
                  planId: orderRecord.planId,
                  status: subscriptionStatus.ACTIVE,
                  paymentType: paymentTypes.ONE_TIME,
                  periodStart: now,
                  periodEnd,
                  cancelAtPeriodEnd: true,
                  metadata: JSON.stringify({ paypalCaptureId: captureId, orderId, isLifetime: months >= 9999, provider: 'paypal' }),
                })
              }
            }
          }
          return redirect(`${config.app.payment.successUrl}?provider=paypal&order_id=${orderId}&paypal_capture=success`)
        } catch (error) {
          console.error('PayPal return capture error:', error)
          return redirect(`${config.app.payment.cancelUrl}?provider=paypal&order_id=${orderId}`)
        }
      }),
    },
  },
})
