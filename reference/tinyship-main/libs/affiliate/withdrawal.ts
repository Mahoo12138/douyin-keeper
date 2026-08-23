import { db } from '@libs/database';
import { user, withdrawal, withdrawalStatus } from '@libs/database/schema';
import { and, eq, sql } from 'drizzle-orm';
import { config } from '@config';
import { nanoid } from 'nanoid';
import type { RequestWithdrawalParams, RequestWithdrawalResult, ProcessWithdrawalParams, ProcessWithdrawalResult } from './types';

/**
 * Submit a withdrawal request. Validates balance, minimum amount, and KYC status.
 * Deducts the amount from commissionBalance immediately (refunded on rejection).
 */
export async function requestWithdrawal(
  params: RequestWithdrawalParams
): Promise<RequestWithdrawalResult> {
  const { userId, amount, paymentMethod, paymentAccount } = params;
  const currency = config.affiliate.currency;

  if (amount <= 0) {
    return { success: false, error: 'Invalid withdrawal amount' };
  }

  if (amount < config.affiliate.minWithdrawalAmount) {
    return { success: false, error: `Minimum withdrawal amount is ${config.affiliate.minWithdrawalAmount}` };
  }

  const userRecord = await db
    .select({
      commissionBalance: user.commissionBalance,
      kycVerified: user.kycVerified,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!userRecord.length) {
    return { success: false, error: 'User not found' };
  }

  if (!userRecord[0].kycVerified) {
    return { success: false, error: 'KYC verification required' };
  }

  // Early balance check (fast path; the conditional UPDATE below is the actual guard)
  const currentBalance = parseFloat(userRecord[0].commissionBalance || '0');
  if (currentBalance < amount) {
    return { success: false, error: 'Insufficient commission balance' };
  }

  const withdrawalId = nanoid();

  // Atomic conditional deduction: only deducts if balance is still sufficient.
  // This is the concurrency guard — two parallel requests can't both pass
  // because the second UPDATE will see the already-deducted balance.
  //
  // Not wrapped in db.transaction() because better-sqlite3's synchronous
  // transaction driver rejects async callbacks with .returning().
  // The conditional UPDATE itself is atomic; the only residual risk is a crash
  // between UPDATE and INSERT (admin-reconcilable via logs).
  const updatedUsers = await db.update(user)
    .set({
      commissionBalance: sql`CAST(COALESCE(${user.commissionBalance}, '0') AS REAL) - ${amount}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(user.id, userId),
        sql`CAST(COALESCE(${user.commissionBalance}, '0') AS REAL) >= ${amount}`,
      )
    )
    .returning({ id: user.id });

  if (updatedUsers.length === 0) {
    return { success: false, error: 'Insufficient commission balance' };
  }

  await db.insert(withdrawal).values({
    id: withdrawalId,
    userId,
    amount: amount.toString(),
    currency,
    paymentMethod,
    paymentAccount,
    status: withdrawalStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return { success: true, withdrawalId };
}

/**
 * Process a withdrawal (admin action).
 * On rejection, refunds the amount back to the user's commissionBalance.
 */
export async function processWithdrawal(
  params: ProcessWithdrawalParams
): Promise<ProcessWithdrawalResult> {
  const { withdrawalId, status, adminNote, processedBy } = params;

  const existing = await db
    .select()
    .from(withdrawal)
    .where(eq(withdrawal.id, withdrawalId))
    .limit(1);

  if (!existing.length) {
    return { success: false, error: 'Withdrawal not found' };
  }

  const record = existing[0];

  if (record.status === withdrawalStatus.COMPLETED || record.status === withdrawalStatus.REJECTED) {
    return { success: false, error: 'Withdrawal already processed' };
  }

  await db.update(withdrawal)
    .set({
      status,
      adminNote: adminNote || null,
      processedBy,
      processedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(withdrawal.id, withdrawalId));

  if (status === 'rejected') {
    const amount = parseFloat(record.amount);
    await db.update(user)
      .set({
        commissionBalance: sql`CAST(${user.commissionBalance} AS REAL) + ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(user.id, record.userId));
  }

  return { success: true };
}
