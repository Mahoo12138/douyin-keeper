import { NextResponse } from 'next/server';
import { auth } from '@libs/auth';
import { creditService } from '@libs/credits';

/**
 * Get current user's credit balance
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
    const balance = await creditService.getBalance(userId);
    
    return NextResponse.json({ balance });
  } catch (error) {
    console.error('Failed to fetch credit balance:', error);
    return NextResponse.json(
      { error: 'Failed to fetch credit balance' },
      { status: 500 }
    );
  }
}

