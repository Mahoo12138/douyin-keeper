import { createPaymentProvider } from '@libs/payment';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    
    // 从请求头中提取 Creem 签名
    const signature = request.headers.get('creem-signature') || '';
    
    if (!signature) {
      console.error('Missing creem-signature header');
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }
    
    const provider = createPaymentProvider('creem');
    const result = await provider.handleWebhook(rawBody, signature);
    
    if (result.success) {
      return NextResponse.json({ success: true }, { status: 200 });
    } else {
      return NextResponse.json({ error: 'Webhook processing failed' }, { status: 400 });
    }
  } catch (error) {
    console.error('Creem webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 