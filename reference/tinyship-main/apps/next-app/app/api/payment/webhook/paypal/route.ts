import { NextResponse } from 'next/server';
import { createPaymentProvider } from '@libs/payment';

/**
 * PayPal Webhook Handler
 * 
 * Handles webhook events from PayPal for:
 * - One-time payments (PAYMENT.CAPTURE.COMPLETED, etc.)
 * - Subscriptions (BILLING.SUBSCRIPTION.*, PAYMENT.SALE.COMPLETED)
 * 
 * PayPal webhook documentation:
 * https://developer.paypal.com/docs/api/webhooks/v1/
 */
export async function POST(request: Request) {
  const body = await request.text();
  
  // PayPal sends multiple headers for webhook verification
  // Note: For full security, you should verify the webhook signature
  // using PayPal's verify webhook signature API endpoint
  const paypalTransmissionId = request.headers.get('paypal-transmission-id');
  const paypalTransmissionTime = request.headers.get('paypal-transmission-time');
  const paypalTransmissionSig = request.headers.get('paypal-transmission-sig');
  const paypalCertUrl = request.headers.get('paypal-cert-url');
  const paypalAuthAlgo = request.headers.get('paypal-auth-algo');

  // Basic validation - check that we have the required headers
  if (!paypalTransmissionId || !paypalTransmissionSig) {
    console.error('Missing PayPal webhook headers');
    return NextResponse.json({ error: 'Missing required headers' }, { status: 400 });
  }

  try {
    const paypalProvider = createPaymentProvider('paypal');
    
    // Pass the signature for verification (composite of all headers)
    const signatureData = JSON.stringify({
      transmissionId: paypalTransmissionId,
      transmissionTime: paypalTransmissionTime,
      transmissionSig: paypalTransmissionSig,
      certUrl: paypalCertUrl,
      authAlgo: paypalAuthAlgo
    });
    
    const verification = await paypalProvider.handleWebhook(body, signatureData);

    if (!verification.success) {
      console.error('PayPal webhook verification failed');
      return NextResponse.json(
        { error: 'Webhook verification failed' },
        { status: 400 }
      );
    }

    // PayPal expects a 200 response to acknowledge receipt
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('PayPal webhook error:', err);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 400 }
    );
  }
}

/**
 * PayPal may send GET requests to verify the webhook endpoint
 */
export async function GET() {
  return NextResponse.json({ status: 'PayPal webhook endpoint active' });
}
