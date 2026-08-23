import { NextResponse } from 'next/server';
import { createPaymentProvider } from '@libs/payment';

export async function POST(request: Request) {
  const body = await request.text();
  const webhookId = request.headers.get('webhook-id');
  const webhookSignature = request.headers.get('webhook-signature');
  const webhookTimestamp = request.headers.get('webhook-timestamp');

  if (!webhookId || !webhookSignature || !webhookTimestamp) {
    return NextResponse.json({ error: 'Missing webhook headers' }, { status: 400 });
  }

  try {
    const dodoProvider = createPaymentProvider('dodo');
    const verification = await dodoProvider.handleWebhook(body, JSON.stringify({
      'webhook-id': webhookId,
      'webhook-signature': webhookSignature,
      'webhook-timestamp': webhookTimestamp,
    }));

    if (!verification.success) {
      return NextResponse.json(
        { error: 'Webhook verification failed' },
        { status: 400 }
      );
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('Dodo Payments webhook error:', err);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 400 }
    );
  }
}
