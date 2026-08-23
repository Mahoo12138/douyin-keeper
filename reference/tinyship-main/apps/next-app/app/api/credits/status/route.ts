import { NextResponse } from 'next/server';
import { auth } from '@libs/auth';
import { creditService } from '@libs/credits';
import { checkSubscriptionStatus } from '@libs/database/utils/subscription';

/**
 * Get current user's credit status summary
 * Includes balance, subscription status, and usage stats
 */
export async function GET(request: Request) {
  try {
    // Get current user session
    const sessionHeaders = new Headers(request.headers);
    const session = await auth.api.getSession({
      headers: sessionHeaders
    });
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const userId = session.user.id;
    
    // Get credit status and subscription status in parallel
    const [creditStatus, subscription] = await Promise.all([
      creditService.getStatus(userId),
      checkSubscriptionStatus(userId)
    ]);
    
    return NextResponse.json({
      credits: {
        balance: creditStatus.balance,
        totalPurchased: creditStatus.totalPurchased,
        totalConsumed: creditStatus.totalConsumed
      },
      hasSubscription: !!subscription,
      // User can access features if they have subscription OR credits
      canAccess: !!subscription || creditStatus.balance > 0
    });
  } catch (error) {
    console.error('Failed to fetch credit status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch credit status' },
      { status: 500 }
    );
  }
}

