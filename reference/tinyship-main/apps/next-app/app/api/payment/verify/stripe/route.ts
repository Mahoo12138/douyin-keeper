import { NextResponse } from 'next/server';
import { config } from '@config';
import Stripe from 'stripe';

const stripe = new Stripe(config.payment.providers.stripe.secretKey, {
  apiVersion: '2025-04-30.basil',
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('session_id');

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    // 1. 验证会话是否存在且有效
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    if (!session || !session.payment_status) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 400 });
    }
    console.log('the payment', session.payment_status);
    // 2. 验证支付状态
    if (session.payment_status !== 'paid') {
      return NextResponse.json({ error: 'Payment not completed' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Session verification failed:', error);
    return NextResponse.json({ error: 'Session verification failed' }, { status: 500 });
  }
} 