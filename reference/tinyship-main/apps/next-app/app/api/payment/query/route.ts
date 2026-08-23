import { NextRequest, NextResponse } from 'next/server';
import { createPaymentProvider } from '@libs/payment';
import { auth } from '@libs/auth';
import { db } from '@libs/database';
import { order } from '@libs/database/schema';
import { eq } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  try {
    // 获取当前用户会话 (authMiddleware已验证用户已登录)
    const session = await auth.api.getSession({
      headers: new Headers(req.headers)
    });
    
    const userId = session!.user!.id;
    
    const searchParams = req.nextUrl.searchParams;
    const orderId = searchParams.get('orderId');
    const provider = searchParams.get('provider') as 'wechat' | 'stripe';

    if (!orderId || !provider) {
      return NextResponse.json({ error: 'Missing orderId or provider' }, { status: 400 });
    }

    // 验证订单是否属于当前用户
    const userOrder = await db.select({
      id: order.id,
      userId: order.userId,
      provider: order.provider
    })
    .from(order)
    .where(eq(order.id, orderId))
    .limit(1);

    if (!userOrder.length) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (userOrder[0].userId !== userId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // 验证provider是否匹配
    if (userOrder[0].provider !== provider) {
      return NextResponse.json({ error: 'Provider mismatch' }, { status: 400 });
    }

    if (provider === 'wechat') {
      const wechatProvider = createPaymentProvider('wechat');
      const result = await wechatProvider.queryOrder(orderId);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Unsupported provider' }, { status: 400 });
  } catch (error) {
    console.error('Payment query error:', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
} 