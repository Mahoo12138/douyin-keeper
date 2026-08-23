import { db, isD1Dialect, runD1Batch } from '@libs/database';
import { order, commission, commissionStatus, user } from '@libs/database/schema';
import { eq, sql } from 'drizzle-orm';
import { config } from '@config';
import { nanoid } from 'nanoid';
import type { CommissionResult } from './types';

/**
 * Process referral commission for a paid order.
 * Called by payment webhooks after successful payment.
 * Idempotent: skips if a commission already exists for this order.
 */
export async function processReferralCommission(orderId: string): Promise<CommissionResult> {
  const startedAt = Date.now();
  const logPrefix = '[Affiliate][Commission]';
  const logContext = { orderId };

  try {
    if (!config.affiliate.enabled) {
      console.info(`${logPrefix} Skipped: affiliate disabled`, logContext);
      return { created: false, error: 'Affiliate system is disabled' };
    }

    const orderRecord = await db
      .select()
      .from(order)
      .where(eq(order.id, orderId))
      .limit(1);

    if (!orderRecord.length) {
      console.warn(`${logPrefix} Skipped: order not found`, logContext);
      return { created: false, error: 'Order not found' };
    }

    const orderData = orderRecord[0];
    const metadata = orderData.metadata as { referralCode?: string; referrerId?: string } | null;

    if (orderData.currency !== config.affiliate.currency) {
      console.warn(`${logPrefix} Skipped: order currency does not match affiliate currency`, {
        ...logContext,
        orderCurrency: orderData.currency,
        affiliateCurrency: config.affiliate.currency,
      });
      return { created: false, error: 'Order currency is not eligible for affiliate commission' };
    }

    if (!metadata?.referrerId) {
      console.info(`${logPrefix} Skipped: no referrer on order metadata`, logContext);
      return { created: false };
    }
    const referrerId = metadata.referrerId;

    // Idempotency check
    const existingCommission = await db
      .select({ id: commission.id })
      .from(commission)
      .where(eq(commission.orderId, orderId))
      .limit(1);

    if (existingCommission.length) {
      console.info(`${logPrefix} Skipped: commission already exists`, {
        ...logContext,
        existingCommissionId: existingCommission[0].id,
      });
      return { created: false, error: 'Commission already exists for this order' };
    }

    const commissionRate = config.affiliate.commissionRate;
    const orderAmount = parseFloat(orderData.amount);
    const fixedCommission = config.affiliate.fixedCommissionAmount;
    const commissionAmount = fixedCommission > 0
      ? fixedCommission
      : orderAmount * commissionRate;

    const commissionId = nanoid();
    const commissionInsert = db.insert(commission).values({
      id: commissionId,
      referrerId,
      orderId: orderId,
      buyerId: orderData.userId,
      orderAmount: orderData.amount,
      currency: orderData.currency,
      commissionRate: commissionRate.toString(),
      commissionAmount: commissionAmount.toString(),
      status: commissionStatus.CREDITED,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const balanceUpdate = db.update(user)
      .set({
        commissionBalance: sql`CAST(COALESCE(${user.commissionBalance}, '0') AS REAL) + ${commissionAmount}`,
        updatedAt: new Date(),
      })
      .where(eq(user.id, referrerId));

    if (isD1Dialect()) {
      // D1 batches are atomic, unlike Drizzle's transaction callback which
      // emits SAVEPOINT statements unsupported by the Workers binding.
      await runD1Batch([commissionInsert, balanceUpdate]);
    } else {
      await db.transaction(async (tx) => {
      await tx.insert(commission).values({
        id: commissionId,
        referrerId,
        orderId: orderId,
        buyerId: orderData.userId,
        orderAmount: orderData.amount,
        currency: orderData.currency,
        commissionRate: commissionRate.toString(),
        commissionAmount: commissionAmount.toString(),
        status: commissionStatus.CREDITED,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await tx.update(user)
        .set({
          commissionBalance: sql`CAST(COALESCE(${user.commissionBalance}, '0') AS REAL) + ${commissionAmount}`,
          updatedAt: new Date(),
        })
        .where(eq(user.id, referrerId));
      });
    }

    console.info(`${logPrefix} Completed`, {
      ...logContext,
      referrerId,
      commissionId,
      commissionAmount,
      durationMs: Date.now() - startedAt,
    });

    return {
      created: true,
      commissionId,
      amount: commissionAmount,
    };
  } catch (error) {
    console.error(`${logPrefix} Commission processing failed`, {
      ...logContext,
      durationMs: Date.now() - startedAt,
      error,
    });
    return { created: false, error: String(error) };
  }
}
