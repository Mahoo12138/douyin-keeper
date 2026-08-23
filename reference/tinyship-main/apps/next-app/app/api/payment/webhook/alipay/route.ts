import { NextResponse } from 'next/server';
import { createPaymentProvider } from '@libs/payment';

export async function POST(request: Request) {
  // Alipay sends notification as application/x-www-form-urlencoded
  const body = await request.text();
  console.log('Alipay webhook body:', body);

  if (!body) {
    return NextResponse.json({ error: 'Empty request body' }, { status: 400 });
  }

  try {
    const alipayProvider = createPaymentProvider('alipay');
    
    // Pass the raw body and empty signature (SDK extracts sign from body)
    const verification = await alipayProvider.handleWebhook(body, '');

    if (!verification.success) {
      // Alipay requires "fail" response for failed verification
      return new Response('fail', { status: 200 });
    }

    // Alipay requires "success" response (plain text)
    return new Response('success', { status: 200 });
  } catch (err) {
    console.error('Alipay webhook error:', err);
    // Return "fail" so Alipay will retry
    return new Response('fail', { status: 200 });
  }
}
