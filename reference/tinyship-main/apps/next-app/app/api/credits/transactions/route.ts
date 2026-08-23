import { NextResponse } from 'next/server';
import { auth } from '@libs/auth';
import { creditService } from '@libs/credits';
import type { CreditTransactionType } from '@libs/credits';

/**
 * Get current user's credit transaction history with pagination
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
    
    // Parse query parameters
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '10', 10), 100);
    const type = url.searchParams.get('type') as CreditTransactionType | null;
    
    const result = await creditService.getTransactionsPaginated(userId, {
      page,
      limit,
      type: type || undefined
    });
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to fetch credit transactions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch credit transactions' },
      { status: 500 }
    );
  }
}

