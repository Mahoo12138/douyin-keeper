import { db } from '@libs/database';
import { user } from '@libs/database/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { config } from '@config';
import { creditService, TransactionTypeCode } from '@libs/credits';
import { nanoid } from 'nanoid';
import type { ApplyReferralParams, ApplyReferralResult } from './types';

export function getReferralCodeFromCookieHeader(
  cookieHeader: string | null,
  cookieName: string
): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';').map(part => part.trim());
  for (const part of parts) {
    if (part.startsWith(`${cookieName}=`)) {
      return decodeURIComponent(part.substring(cookieName.length + 1));
    }
  }
  return null;
}

/**
 * Generate a unique referral code for a user (lazy-generated on first affiliate page visit).
 * Returns the existing code if one already exists.
 */
export async function generateReferralCode(userId: string): Promise<string> {
  const existingUser = await db
    .select({ referralCode: user.referralCode })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!existingUser.length) {
    throw new Error('User not found');
  }

  if (existingUser[0].referralCode) {
    return existingUser[0].referralCode;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = nanoid(8);
    try {
      const updatedUsers = await db.update(user)
        .set({ referralCode: code, updatedAt: new Date() })
        .where(and(eq(user.id, userId), isNull(user.referralCode)))
        .returning({ referralCode: user.referralCode });

      if (updatedUsers[0]?.referralCode) {
        return updatedUsers[0].referralCode;
      }
    } catch (error) {
      console.warn('[Affiliate][Referral] Referral code generation retry triggered:', error);
    }

    const concurrentUser = await db
      .select({ referralCode: user.referralCode })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (concurrentUser[0]?.referralCode) {
      return concurrentUser[0].referralCode;
    }
  }

  const refreshedUser = await db
    .select({ referralCode: user.referralCode })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (refreshedUser[0]?.referralCode) {
    return refreshedUser[0].referralCode;
  }

  throw new Error('Failed to generate referral code');
}

/**
 * Claim a referral code for a user. Validates the code and persists the attribution.
 * On successful claim, grants mutual signup bonuses (configurable).
 */
export async function applyReferralCodeToUser(
  params: ApplyReferralParams
): Promise<ApplyReferralResult> {
  const { userId, referralCode } = params;

  if (!referralCode) {
    return { applied: false, reason: 'no_referral_code' };
  }

  if (!config.affiliate.enabled) {
    return { applied: false, reason: 'affiliate_disabled' };
  }

  const userRecord = await db
    .select({ id: user.id, referredByCode: user.referredByCode })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!userRecord.length) {
    return { applied: false, reason: 'user_not_found' };
  }

  if (userRecord[0].referredByCode) {
    return { applied: false, reason: 'already_claimed' };
  }

  const referrer = await db
    .select({ id: user.id, referralCode: user.referralCode })
    .from(user)
    .where(eq(user.referralCode, referralCode))
    .limit(1);

  if (!referrer.length) {
    return { applied: false, reason: 'invalid_referrer' };
  }

  if (referrer[0].id === userId) {
    return { applied: false, reason: 'self_referral' };
  }

  await db.update(user)
    .set({ referredByCode: referralCode, updatedAt: new Date() })
    .where(eq(user.id, userId));

  let bonusGranted = true;
  let bonusError: string | undefined;

  // Grant mutual signup bonuses and surface failures to the caller.
  try {
    const refereeBonus = config.affiliate.refereeSignupBonus;
    if (refereeBonus > 0) {
      await creditService.addCredits({
        userId,
        amount: refereeBonus,
        type: 'bonus',
        description: TransactionTypeCode.REFERRAL_SIGNUP_BONUS,
        metadata: { referrerId: referrer[0].id, referralCode },
      });
    }

    const referrerBonus = config.affiliate.referrerSignupBonus;
    if (referrerBonus > 0) {
      await creditService.addCredits({
        userId: referrer[0].id,
        amount: referrerBonus,
        type: 'bonus',
        description: TransactionTypeCode.REFERRAL_REFERRER_BONUS,
        metadata: { refereeId: userId, referralCode },
      });
    }
  } catch (error) {
    bonusGranted = false;
    bonusError = error instanceof Error ? error.message : 'Unknown bonus error';
    console.error('[Affiliate][Referral] Failed to grant signup bonus:', error);
  }

  return { applied: true, bonusGranted, bonusError };
}
