import { NextResponse } from 'next/server';
import { createPaymentProvider } from '@libs/payment';

export async function POST(request: Request) {
  const body = await request.text();
  console.log('body', body)
  // 微信支付需要的签名头
  const signature = request.headers.get('wechatpay-signature');
  const timestamp = request.headers.get('wechatpay-timestamp');
  const nonce = request.headers.get('wechatpay-nonce');
  const serial = request.headers.get('wechatpay-serial');
  console.log('signature', signature)
  console.log('timestamp', timestamp)
  console.log('nonce', nonce)
  console.log('serial', serial)
  if (!signature || !timestamp || !nonce || !serial) {
    return NextResponse.json({ error: 'Missing required headers' }, { status: 400 });
  }

  try {
    const wechatProvider = createPaymentProvider('wechat');
    const verification = await wechatProvider.handleWebhook({
      headers: {
        'wechatpay-signature': signature,
        'wechatpay-timestamp': timestamp,
        'wechatpay-nonce': nonce,
        'wechatpay-serial': serial
      },
      body
    }, signature);

    if (!verification.success) {
      return NextResponse.json(
        { error: 'Webhook verification failed' },
        { status: 400 }
      );
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('WeChat Pay webhook error:', err);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 400 }
    );
  }
} 