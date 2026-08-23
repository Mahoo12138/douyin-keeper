import { NextResponse } from 'next/server';
import { auth } from '@libs/auth';
import { checkSubscriptionStatus, isLifetimeMember } from '@libs/database/utils/subscription';
import { headers } from 'next/headers';

/**
 * 获取当前用户的订阅状态
 */
export async function GET(request: Request) {
  // 获取当前用户 (authMiddleware已验证用户已登录)
  const sessionHeaders = new Headers(request.headers);
  const session = await auth.api.getSession({
    headers: sessionHeaders
  });
  
  const userId = session!.user!.id;
  
  // 检查订阅状态
  const subscription = await checkSubscriptionStatus(userId);
  console.log('subscription', subscription);
  const isLifetime = await isLifetimeMember(userId);
  
  return NextResponse.json({
    hasSubscription: !!subscription,
    isLifetime,
    subscription: subscription || null
  });
} 