import { NextResponse } from 'next/server';
import { createPaymentProvider, type PaymentPlan } from '@libs/payment';
import { db } from '@libs/database';
import { order, orderStatus } from '@libs/database/schema/order';
import { subscription, subscriptionStatus, paymentTypes } from '@libs/database/schema/subscription';
import { eq, and, desc } from 'drizzle-orm';
import { config } from '@config';
import { creditService, TransactionTypeCode } from '@libs/credits';
import { randomUUID } from 'crypto';
import { utcNow } from '@libs/database/utils/utc';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const orderId = url.searchParams.get('order_id');
  const isSubscription = url.searchParams.get('subscription') === 'true';

  if (!orderId) {
    return NextResponse.redirect(`${config.app.payment.cancelUrl}?provider=paypal`);
  }

  // For subscriptions, activation is handled by webhook (BILLING.SUBSCRIPTION.ACTIVATED)
  // We also query subscription status to update immediately if ACTIVE
  if (isSubscription) {
    try {
      const orderRecord = await db.query.order.findFirst({
        where: eq(order.id, orderId)
      });

      if (!orderRecord?.providerOrderId) {
        return NextResponse.redirect(`${config.app.payment.cancelUrl}?provider=paypal&order_id=${orderId}`);
      }

      const paypalProvider = createPaymentProvider('paypal');
      const subscriptionDetails = await paypalProvider.getSubscription(orderRecord.providerOrderId);

      if (subscriptionDetails?.status === 'ACTIVE') {
        // Update order status only if still pending to prevent double fulfillment
        const now = utcNow();
        const updatedOrders = await db.update(order)
          .set({ status: orderStatus.PAID, updatedAt: now })
          .where(and(eq(order.id, orderId), eq(order.status, orderStatus.PENDING)))
          .returning({ id: order.id });

        if (updatedOrders.length === 0) {
          const successUrl = `${config.app.payment.successUrl}?provider=paypal&order_id=${orderId}&subscription=true`;
          return NextResponse.redirect(successUrl);
        }

        // Calculate subscription period
        let periodEnd = new Date(now);
        if (subscriptionDetails.billing_info?.next_billing_time) {
          periodEnd = new Date(subscriptionDetails.billing_info.next_billing_time);
        } else {
          const plan = config.payment.plans[orderRecord.planId as keyof typeof config.payment.plans] as PaymentPlan;
          const months = plan.duration.months ?? 1;
          periodEnd.setMonth(periodEnd.getMonth() + months);
        }

        const existingSubscription = await db.query.subscription.findFirst({
          where: eq(subscription.paypalSubscriptionId, orderRecord.providerOrderId)
        });

        if (existingSubscription) {
          await db.update(subscription)
            .set({
              status: subscriptionStatus.ACTIVE,
              periodStart: now,
              periodEnd: periodEnd,
              updatedAt: now,
              metadata: JSON.stringify({
                ...JSON.parse(existingSubscription.metadata || '{}'),
                paypalPlanId: subscriptionDetails.plan_id,
                processedBy: 'return'
              })
            })
            .where(eq(subscription.id, existingSubscription.id));
        } else {
          await db.insert(subscription).values({
            id: randomUUID(),
            userId: orderRecord.userId,
            planId: orderRecord.planId,
            status: subscriptionStatus.ACTIVE,
            paymentType: paymentTypes.RECURRING,
            paypalSubscriptionId: orderRecord.providerOrderId,
            periodStart: now,
            periodEnd: periodEnd,
            cancelAtPeriodEnd: false,
            metadata: JSON.stringify({
              paypalPlanId: subscriptionDetails.plan_id,
              processedBy: 'return'
            })
          });
        }
      }
    } catch (error) {
      console.error('PayPal return subscription check error:', error);
    }

    const successUrl = `${config.app.payment.successUrl}?provider=paypal&order_id=${orderId}&subscription=true`;
    return NextResponse.redirect(successUrl);
  }

  try {
    const orderRecord = await db.query.order.findFirst({
      where: eq(order.id, orderId)
    });

    if (!orderRecord?.providerOrderId) {
      console.error('PayPal return: No providerOrderId found for order:', orderId);
      return NextResponse.redirect(`${config.app.payment.cancelUrl}?provider=paypal&order_id=${orderId}`);
    }

    // Check if order is already paid (avoid duplicate capture)
    if (orderRecord.status === orderStatus.PAID) {
      const successUrl = `${config.app.payment.successUrl}?provider=paypal&order_id=${orderId}&paypal_capture=success`;
      return NextResponse.redirect(successUrl);
    }

    const paypalProvider = createPaymentProvider('paypal');
    const captureResult = await paypalProvider.captureOrder(orderRecord.providerOrderId);

    if (captureResult.status !== 'COMPLETED') {
      console.error('PayPal capture not completed:', captureResult.status);
      return NextResponse.redirect(`${config.app.payment.cancelUrl}?provider=paypal&order_id=${orderId}`);
    }

    // === Synchronously update order status ===
    const captureNow = utcNow();
    const captureId = captureResult.purchase_units?.[0]?.payments?.captures?.[0]?.id;
    const existingMetadata = (() => {
      if (!orderRecord.metadata) {
        return {};
      }
      if (typeof orderRecord.metadata === 'object') {
        return orderRecord.metadata as Record<string, unknown>;
      }
      if (typeof orderRecord.metadata === 'string') {
        try {
          return JSON.parse(orderRecord.metadata) as Record<string, unknown>;
        } catch {
          return {};
        }
      }
      return {};
    })();

    const updatedOrders = await db.update(order)
      .set({
        status: orderStatus.PAID,
        metadata: {
          ...existingMetadata,
          paypalCaptureId: captureId,
          capturedAt: captureNow.toISOString()
        },
        updatedAt: captureNow
      })
      .where(and(eq(order.id, orderId), eq(order.status, orderStatus.PENDING)))
      .returning({ id: order.id });

    if (updatedOrders.length === 0) {
      const successUrl = `${config.app.payment.successUrl}?provider=paypal&order_id=${orderId}&paypal_capture=success`;
      return NextResponse.redirect(successUrl);
    }

    // === Handle based on plan type ===
    const plan = config.payment.plans[orderRecord.planId as keyof typeof config.payment.plans] as PaymentPlan | undefined;
    
    if (plan?.duration.type === 'credits' && plan.credits) {
      // Credit pack purchase
      await creditService.addCredits({
        userId: orderRecord.userId,
        amount: plan.credits,
        type: 'purchase',
        orderId: orderId,
        description: TransactionTypeCode.PURCHASE,
        metadata: {
          paypalCaptureId: captureId,
          planId: orderRecord.planId,
          provider: 'paypal'
        }
      });
    } else if (plan?.duration.type === 'one_time') {
      // One-time subscription payment
      const now = utcNow();
      const months = plan.duration.months ?? 1;

      // Check if user already has active subscription for this plan
      const existingSubscription = await db.query.subscription.findFirst({
        where: and(
          eq(subscription.userId, orderRecord.userId),
          eq(subscription.planId, orderRecord.planId),
          eq(subscription.status, subscriptionStatus.ACTIVE)
        ),
        orderBy: [desc(subscription.periodEnd)]
      });

      if (existingSubscription) {
        // Extend existing subscription
        const existingPeriodEnd = existingSubscription.periodEnd;
        const extensionStart = existingPeriodEnd > now ? existingPeriodEnd : now;
        
        const extensionEnd = new Date(extensionStart);
        if (months >= 9999) {
          extensionEnd.setFullYear(extensionEnd.getFullYear() + 100);
        } else {
          extensionEnd.setMonth(extensionEnd.getMonth() + months);
        }
        
        await db.update(subscription)
          .set({
            periodEnd: extensionEnd,
            updatedAt: now,
            metadata: JSON.stringify({
              ...JSON.parse(existingSubscription.metadata || '{}'),
              renewed: true,
              lastPaypalCaptureId: captureId,
              lastOrderId: orderId,
              lastPaymentTime: now.toISOString(),
              isLifetime: months >= 9999,
              provider: 'paypal'
            })
          })
          .where(eq(subscription.id, existingSubscription.id));
      } else {
        // Create new subscription
        const periodEnd = new Date(now);
        if (months >= 9999) {
          periodEnd.setFullYear(periodEnd.getFullYear() + 100);
        } else {
          periodEnd.setMonth(periodEnd.getMonth() + months);
        }
        
        await db.insert(subscription).values({
          id: randomUUID(),
          userId: orderRecord.userId,
          planId: orderRecord.planId,
          status: subscriptionStatus.ACTIVE,
          paymentType: paymentTypes.ONE_TIME,
          periodStart: now,
          periodEnd: periodEnd,
          cancelAtPeriodEnd: true,
          metadata: JSON.stringify({
            paypalCaptureId: captureId,
            orderId: orderId,
            isLifetime: months >= 9999,
            provider: 'paypal'
          })
        });
      }
    }

    const successUrl = `${config.app.payment.successUrl}?provider=paypal&order_id=${orderId}&paypal_capture=success`;
    return NextResponse.redirect(successUrl);
  } catch (error) {
    console.error('PayPal return capture error:', error);
    return NextResponse.redirect(`${config.app.payment.cancelUrl}?provider=paypal&order_id=${orderId}`);
  }
}
