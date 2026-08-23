import { createPaymentProvider } from '@libs/payment';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // 检查是否有 signature 参数（Creem return URL 的标志）
    const signature = searchParams.get('signature');
    
    if (signature) {
      // 这是一个完整的 Creem return URL，使用签名验证
      const fullUrl = request.url;
      const creemProvider = createPaymentProvider('creem');
      
      // 使用 verifyReturnUrl 验证签名和参数
      const verification = await creemProvider.verifyReturnUrl(fullUrl);
      
      if (!verification.isValid) {
        console.error('Creem return URL verification failed:', verification.error);
        return NextResponse.json({ error: 'Invalid return URL or signature' }, { status: 400 });
      }
      
      // 签名验证通过，返回成功（webhook 会处理业务逻辑）
      return NextResponse.json({ 
        success: true,
        verified: true,
        params: verification.params
      });
    }
    
    // 如果没有签名，检查是否有 checkout_id（可能是手动调用）
    const checkoutId = searchParams.get('session_id') || searchParams.get('checkout_id');
    
    if (checkoutId) {
      // 没有签名的 checkout_id，无法安全验证
      return NextResponse.json({ 
        error: 'Missing signature. Creem payments require signature verification for security.' 
      }, { status: 400 });
    }
    
    // 没有任何有效参数
    return NextResponse.json({ 
      error: 'Missing required parameters (checkout_id and signature)' 
    }, { status: 400 });
  } catch (error) {
    console.error('Creem payment verification error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// 保留 POST 方法用于手动验证
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { returnUrl } = body;
    
    if (!returnUrl) {
      return NextResponse.json({ error: 'Missing returnUrl parameter' }, { status: 400 });
    }
    
    const creemProvider = createPaymentProvider('creem');
    const verification = await creemProvider.verifyReturnUrl(returnUrl);
    
    return NextResponse.json(verification);
  } catch (error) {
    console.error('Creem payment verification error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 