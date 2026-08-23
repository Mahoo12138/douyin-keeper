import { NextRequest, NextResponse } from 'next/server';
import { db } from '@libs/database';
import { subscription } from '@libs/database/schema/subscription';
import { user } from '@libs/database/schema/user';
import { eq, and, or, like, desc, asc, count, isNotNull, isNull } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    console.log('Subscriptions API called with params:', Object.fromEntries(searchParams.entries()));
    
    // 分页参数
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = parseInt(searchParams.get('offset') || '0');
    
    // 搜索参数
    const searchField = searchParams.get('searchField');
    const searchValue = searchParams.get('searchValue');
    
    // 筛选参数
    const statusFilter = searchParams.get('status');
    const paymentTypeFilter = searchParams.get('paymentType');
    const providerFilter = searchParams.get('provider');
    
    // 排序参数
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortDirection = searchParams.get('sortDirection') || 'desc';

    // 构建查询条件
    let whereConditions: any[] = [];

    // 搜索条件
    if (searchValue && searchField) {
      switch (searchField) {
        case 'id':
          whereConditions.push(like(subscription.id, `%${searchValue}%`));
          break;
        case 'userId':
          whereConditions.push(eq(subscription.userId, searchValue));
          break;
        case 'planId':
          whereConditions.push(like(subscription.planId, `%${searchValue}%`));
          break;
        case 'stripeSubscriptionId':
          whereConditions.push(
            and(
              isNotNull(subscription.stripeSubscriptionId),
              like(subscription.stripeSubscriptionId, `%${searchValue}%`)
            )
          );
          break;
        case 'creemSubscriptionId':
          whereConditions.push(
            and(
              isNotNull(subscription.creemSubscriptionId),
              like(subscription.creemSubscriptionId, `%${searchValue}%`)
            )
          );
          break;
        case 'dodoSubscriptionId':
          whereConditions.push(
            and(
              isNotNull(subscription.dodoSubscriptionId),
              like(subscription.dodoSubscriptionId, `%${searchValue}%`)
            )
          );
          break;
        case 'userEmail':
          whereConditions.push(like(user.email, `%${searchValue}%`));
          break;
      }
    }

    // 状态筛选
    if (statusFilter && statusFilter !== 'all') {
      whereConditions.push(eq(subscription.status, statusFilter));
    }

    // 支付类型筛选
    if (paymentTypeFilter && paymentTypeFilter !== 'all') {
      whereConditions.push(eq(subscription.paymentType, paymentTypeFilter));
    }

    // 支付提供商筛选
    if (providerFilter && providerFilter !== 'all') {
      if (providerFilter === 'stripe') {
        whereConditions.push(
          or(
            isNotNull(subscription.stripeCustomerId),
            isNotNull(subscription.stripeSubscriptionId)
          )
        );
      } else if (providerFilter === 'creem') {
        whereConditions.push(
          or(
            isNotNull(subscription.creemCustomerId),
            isNotNull(subscription.creemSubscriptionId)
          )
        );
      } else if (providerFilter === 'dodo') {
        whereConditions.push(
          or(
            isNotNull(subscription.dodoCustomerId),
            isNotNull(subscription.dodoSubscriptionId)
          )
        );
      } else if (providerFilter === 'wechat') {
        // WeChat provider: no Stripe, Creem, or Dodo identifiers
        whereConditions.push(
          and(
            isNull(subscription.stripeCustomerId),
            isNull(subscription.stripeSubscriptionId),
            isNull(subscription.creemCustomerId),
            isNull(subscription.creemSubscriptionId),
            isNull(subscription.dodoCustomerId),
            isNull(subscription.dodoSubscriptionId)
          )
        );
      }
    }

    // 构建最终的where条件
    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;
    console.log('Where conditions:', whereConditions.length, 'conditions');
    console.log('Search field:', searchField, 'Search value:', searchValue);

    // 获取总数
    const totalResult = await db
      .select({ count: count() })
      .from(subscription)
      .leftJoin(user, eq(subscription.userId, user.id))
      .where(whereClause);
    
    const total = totalResult[0]?.count || 0;
    console.log('Total subscriptions found:', total);

    // 构建排序 - 修复类型错误
    let orderBy;
    switch (sortBy) {
      case 'id':
        orderBy = sortDirection === 'desc' ? desc(subscription.id) : asc(subscription.id);
        break;
      case 'userId':
        orderBy = sortDirection === 'desc' ? desc(subscription.userId) : asc(subscription.userId);
        break;
      case 'planId':
        orderBy = sortDirection === 'desc' ? desc(subscription.planId) : asc(subscription.planId);
        break;
      case 'status':
        orderBy = sortDirection === 'desc' ? desc(subscription.status) : asc(subscription.status);
        break;
      case 'createdAt':
      default:
        orderBy = sortDirection === 'desc' ? desc(subscription.createdAt) : asc(subscription.createdAt);
        break;
    }

    // 获取订阅数据
    const subscriptions = await db
      .select({
        id: subscription.id,
        userId: subscription.userId,
        planId: subscription.planId,
        status: subscription.status,
        paymentType: subscription.paymentType,
        stripeCustomerId: subscription.stripeCustomerId,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        creemCustomerId: subscription.creemCustomerId,
        creemSubscriptionId: subscription.creemSubscriptionId,
        dodoCustomerId: subscription.dodoCustomerId,
        dodoSubscriptionId: subscription.dodoSubscriptionId,
        periodStart: subscription.periodStart,
        periodEnd: subscription.periodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        createdAt: subscription.createdAt,
        updatedAt: subscription.updatedAt,
        // 关联用户信息
        userName: user.name,
        userEmail: user.email,
      })
      .from(subscription)
      .leftJoin(user, eq(subscription.userId, user.id))
      .where(whereClause)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      subscriptions,
      total,
      page: Math.floor(offset / limit) + 1,
      pageSize: limit,
      totalPages: Math.ceil(total / limit)
    });

  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 