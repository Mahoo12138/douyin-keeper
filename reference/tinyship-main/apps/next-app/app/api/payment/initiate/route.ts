import { auth } from "@libs/auth";
import { createPaymentProvider } from "@libs/payment";
import { nanoid } from "nanoid";
import { db } from "@libs/database";
import { order, orderStatus, paymentProviders } from "@libs/database/schema/order";
import { user as userTable } from "@libs/database/schema/user";
import { config } from "@config";
import { eq } from "drizzle-orm";
import { getPurchasablePlanById } from "@libs/pricing";

// Order expiration time (2 hours)
const ORDER_EXPIRATION_TIME = 2 * 60 * 60 * 1000;

export async function POST(req: Request) {
  try {
    // 1. Get user session (authMiddleware已验证用户已登录)
    const requestHeaders = new Headers(req.headers);
    const session = await auth.api.getSession({
      headers: requestHeaders
    });

    // 2. Get request parameters
    const { planId, provider = paymentProviders.STRIPE } = await req.json();
    if (!planId) {
      return Response.json({ error: 'Plan ID is required' }, { status: 400 });
    }

    // 3. Create order record
    const orderId = nanoid();
    const plan = await getPurchasablePlanById(planId);
    if (!plan) {
      return Response.json({ error: 'Invalid plan' }, { status: 400 });
    }

    // Build referral metadata for commission tracking
    const orderMetadata: Record<string, string> = {};
    try {
      const userRecord = await db.select({ referredByCode: userTable.referredByCode }).from(userTable).where(eq(userTable.id, session!.user!.id)).limit(1);
      const referralCode = userRecord[0]?.referredByCode;
      if (referralCode) {
        const referrer = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.referralCode, referralCode)).limit(1);
        if (referrer.length && referrer[0].id !== session!.user!.id) {
          orderMetadata.referralCode = referralCode;
          orderMetadata.referrerId = referrer[0].id;
        }
      }
    } catch (e) {
      console.warn('[Payment] Failed to resolve referral metadata:', e);
    }

    await db.insert(order).values({
      id: orderId,
      userId: session!.user!.id,
      planId,
      amount: plan.amount.toString(),
      currency: plan.currency,
      status: orderStatus.PENDING,
      provider,
      metadata: orderMetadata,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    console.log('Order created:', orderId);

    // Set up order expiration handler
    setTimeout(async () => {
      try {
        // Query order status
        const currentOrder = await db.query.order.findFirst({
          where: eq(order.id, orderId)
        });

        // Only process orders that are still in pending status
        if (currentOrder?.status === orderStatus.PENDING) {
          // Update order status to canceled
          await db.update(order)
            .set({ 
              status: orderStatus.CANCELED,
              updatedAt: new Date()
            })
            .where(eq(order.id, orderId));
          
          console.log(`Order ${orderId} expired and canceled`);
          
          // For WeChat Pay, call the close order API
          if (provider === paymentProviders.WECHAT) {
            const paymentProvider = createPaymentProvider('wechat');
            await paymentProvider.closeOrder(orderId);
          }
        }
      } catch (error) {
        console.error(`Failed to process expired order ${orderId}:`, error);
      }
    }, ORDER_EXPIRATION_TIME);

    // 4. Create payment provider instance and initiate payment
    const paymentProvider = createPaymentProvider(provider as 'stripe' | 'wechat' | 'paypal');
    // x-forwarded-for may contain multiple IPs (comma-separated), we only need the first one
    // WeChat Pay requires payer_client_ip to be max 45 bytes
    const forwardedFor = req.headers.get('x-forwarded-for')
    const realIp = req.headers.get('x-real-ip')
    const clientIp = forwardedFor 
      ? forwardedFor.split(',')[0].trim() 
      : (realIp || '127.0.0.1')
    
    const result = await paymentProvider.createPayment({
      orderId,
      userId: session!.user!.id,
      planId,
      amount: plan.amount,
      currency: plan.currency,
      plan,
      metadata: {
        clientIp,
        // description: `${plan.name} - ${plan.duration.description}`
      }
    });
    // Merge provider metadata with referral metadata (avoid overwriting referral info)
    await db.update(order)
      .set({
        providerOrderId: result.providerOrderId,
        metadata: { ...orderMetadata, ...(result.metadata || {}) },
        updatedAt: new Date()
      })
      .where(eq(order.id, orderId));

    console.log('Payment initiation result:', result);
    return Response.json(result);
  } catch (error) {
    console.error('Payment initiation error:', error);
    return Response.json(
      { error: 'Failed to initiate payment' },
      { status: 500 }
    );
  }
} 
