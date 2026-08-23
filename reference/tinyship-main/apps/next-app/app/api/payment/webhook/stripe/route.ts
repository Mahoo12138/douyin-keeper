import { NextResponse } from 'next/server';
import { createPaymentProvider, StripeProvider } from '@libs/payment';

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }

  try {
    const stripeProvider = createPaymentProvider('stripe');
    const verification = await stripeProvider.handleWebhook(body, signature);

    if (!verification.success) {
      return NextResponse.json(
        { error: 'Webhook verification failed' },
        { status: 400 }
      );
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('Stripe webhook error:', err);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 400 }
    );
  }
} 