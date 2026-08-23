import { auth } from '@libs/auth';
import { generateReferralCode } from '@libs/affiliate';
import { db } from '@libs/database';
import { user, commission } from '@libs/database/schema';
import { eq, sql } from 'drizzle-orm';
import { config } from '@config';

export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: new Headers(request.headers) });
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const referralCode = await generateReferralCode(userId);

    const userRecord = await db
      .select({ commissionBalance: user.commissionBalance })
      .from(user).where(eq(user.id, userId)).limit(1);

    const commissionStats = await db
      .select({
        totalCommission: sql<string>`COALESCE(SUM(CAST(${commission.commissionAmount} AS REAL)), 0)`,
        totalReferrals: sql<number>`CAST(COUNT(*) AS INTEGER)`,
      })
      .from(commission).where(eq(commission.referrerId, userId));

    const referredUsers = await db
      .select({ count: sql<number>`CAST(COUNT(*) AS INTEGER)` })
      .from(user).where(eq(user.referredByCode, referralCode));

    return Response.json({
      referralCode,
      referralLink: `${config.app.baseUrl}?ref=${referralCode}`,
      commissionBalance: parseFloat(userRecord[0]?.commissionBalance || '0'),
      commissionRate: config.affiliate.commissionRate,
      totalCommission: parseFloat(commissionStats[0]?.totalCommission || '0'),
      totalPaidReferrals: commissionStats[0]?.totalReferrals || 0,
      totalRegisteredReferrals: referredUsers[0]?.count || 0,
      currency: config.affiliate.currency,
      referrerSignupBonus: config.affiliate.referrerSignupBonus,
      refereeSignupBonus: config.affiliate.refereeSignupBonus,
      minWithdrawalAmount: config.affiliate.minWithdrawalAmount,
      enabled: config.affiliate.enabled,
    });
  } catch (error) {
    console.error('Failed to fetch affiliate stats:', error);
    return Response.json({ error: 'Failed to fetch affiliate stats' }, { status: 500 });
  }
}
