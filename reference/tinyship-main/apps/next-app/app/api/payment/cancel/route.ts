import { NextResponse } from 'next/server';
import { auth } from '@libs/auth';
import { createPaymentProvider } from '@libs/payment';
import { db } from '@libs/database';
import { order } from '@libs/database/schema/order';
import { eq } from 'drizzle-orm';

export async function POST(request: Request) {
  const session = await auth.api.getSession({
    headers: new Headers(request.headers),
  });

  if (!session?.user?.id) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const url = new URL(request.url);
  const orderId = url.searchParams.get('orderId');
  const provider = url.searchParams.get('provider');

  if (!orderId) {
    return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
  }

  if (!provider) {
    return NextResponse.json({ error: 'Provider is required' }, { status: 400 });
  }

  try {
    const userOrder = await db
      .select({ id: order.id, userId: order.userId })
      .from(order)
      .where(eq(order.id, orderId))
      .limit(1);

    if (!userOrder.length) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (userOrder[0].userId !== session.user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (provider === 'wechat') {
      const wechatProvider = createPaymentProvider('wechat');
      const success = await wechatProvider.closeOrder(orderId);

      if (success) {
        return NextResponse.json({ success: true, message: 'Order canceled successfully' });
      } else {
        return NextResponse.json({ error: 'Failed to cancel order' }, { status: 500 });
      }
    } else if (provider === 'stripe') {
      return NextResponse.json({ error: 'Canceling Stripe orders is not supported yet' }, { status: 501 });
    } else {
      return NextResponse.json({ error: 'Unsupported payment provider' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error canceling order:', error);
    return NextResponse.json({ error: 'An error occurred while canceling the order' }, { status: 500 });
  }
}
