import { NextResponse } from 'next/server';
import { auth } from '@libs/auth';
import { db } from '@libs/database';
import { subscription } from '@libs/database/schema/subscription';
import { eq, desc } from 'drizzle-orm';
import { createPaymentProvider, StripeProvider, CreemProvider, DodoProvider } from '@libs/payment';
import { config } from '@config';

export async function POST(request: Request) {
  try {
    // 获取用户会话信息 (authMiddleware已验证用户已登录)
    const requestHeaders = new Headers(request.headers);
    const session = await auth.api.getSession({
        headers: requestHeaders
    });

    const userId = session!.user!.id;

    // 获取请求体
    const body = await request.json().catch(() => ({}));
    const { provider, returnUrl: customReturnUrl } = body;
    const returnUrl = customReturnUrl || `${config.app.baseUrl}/dashboard/subscription`;

    // 查找所有用户的订阅，按创建时间倒序（最新的在前）
    const allSubscriptions = await db.query.subscription.findMany({
      where: eq(subscription.userId, userId),
      orderBy: [desc(subscription.createdAt)] // 最新的在前
    });

    if (allSubscriptions.length === 0) {
      return NextResponse.json(
        { error: '找不到订阅信息' },
        { status: 404 }
      );
    }
    
    // 优先选择活跃的订阅，如果没有则选择最新的
    const activeSubscription = allSubscriptions.find(sub => sub.status === 'active') || 
                              allSubscriptions.find(sub => sub.status === 'paid') ||
                              allSubscriptions[0]; // 如果都没有活跃的，选择最新的



    console.log('activeSubscription', activeSubscription); // 调试日志

    // 根据指定的提供商或自动检测提供商
    let paymentProvider = provider;
    
    if (!paymentProvider) {
      // 自动检测：优先选择有订阅ID的提供商
      if (activeSubscription.stripeSubscriptionId || activeSubscription.stripeCustomerId) {
        paymentProvider = 'stripe';
      } else if (activeSubscription.creemSubscriptionId || activeSubscription.creemCustomerId) {
        paymentProvider = 'creem';
      } else if (activeSubscription.dodoSubscriptionId || activeSubscription.dodoCustomerId) {
        paymentProvider = 'dodo';
      } else {
        return NextResponse.json(
          { error: '无法确定支付提供商' },
          { status: 400 }
        );
      }
    }

    console.log('detected paymentProvider:', paymentProvider); // 调试日志

    // 处理不同的支付提供商
    if (paymentProvider === 'stripe') {
      if (!activeSubscription.stripeCustomerId) {
        return NextResponse.json(
          { error: '找不到 Stripe 客户信息' },
          { status: 404 }
        );
      }

      const stripeProvider = createPaymentProvider('stripe') as StripeProvider;
      const portalSession = await stripeProvider.createCustomerPortal(
        activeSubscription.stripeCustomerId,
        returnUrl
      );

      return NextResponse.json({ url: portalSession.url });
    } 
    else if (paymentProvider === 'creem') {
      if (!activeSubscription.creemCustomerId) {
        return NextResponse.json(
          { error: '找不到 Creem 客户信息' },
          { status: 404 }
        );
      }

      const creemProvider = createPaymentProvider('creem') as CreemProvider;
      const portalSession = await creemProvider.createCreemCustomerPortal(
        activeSubscription.creemCustomerId,
        returnUrl
      );

      return NextResponse.json({ url: portalSession.url });
    }
    else if (paymentProvider === 'dodo') {
      if (!activeSubscription.dodoCustomerId) {
        return NextResponse.json(
          { error: '找不到 Dodo 客户信息' },
          { status: 404 }
        );
      }

      const dodoProvider = createPaymentProvider('dodo') as DodoProvider;
      const portalSession = await dodoProvider.createDodoCustomerPortal(
        activeSubscription.dodoCustomerId,
        returnUrl
      );

      return NextResponse.json({ url: portalSession.url });
    }
    else {
      return NextResponse.json(
        { error: `不支持的支付提供商: ${paymentProvider}` },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error('创建客户门户会话失败:', error);
    return NextResponse.json(
      { error: '创建门户会话失败' },
      { status: 500 }
    );
  }
} 