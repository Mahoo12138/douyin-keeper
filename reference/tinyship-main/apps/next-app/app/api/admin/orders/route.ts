import { NextRequest, NextResponse } from 'next/server';
import { db } from '@libs/database';
import { order } from '@libs/database/schema/order';
import { user } from '@libs/database/schema/user';
import { eq, and, or, like, desc, asc, count } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    console.log('Orders API called with params:', Object.fromEntries(searchParams.entries()));
    
    // 分页参数
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = parseInt(searchParams.get('offset') || '0');
    
    // 搜索参数
    const searchField = searchParams.get('searchField');
    const searchValue = searchParams.get('searchValue');
    
    // 筛选参数
    const statusFilter = searchParams.get('status');
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
          whereConditions.push(eq(order.id, searchValue));
          break;
        case 'userId':
          whereConditions.push(eq(order.userId, searchValue));
          break;
        case 'planId':
          whereConditions.push(like(order.planId, `%${searchValue}%`));
          break;
        case 'userEmail':
          whereConditions.push(like(user.email, `%${searchValue}%`));
          break;
        case 'providerOrderId':
          whereConditions.push(like(order.providerOrderId, `%${searchValue}%`));
          break;
      }
    }

    // 状态筛选
    if (statusFilter && statusFilter !== 'all') {
      whereConditions.push(eq(order.status, statusFilter));
    }

    // 支付提供商筛选
    if (providerFilter && providerFilter !== 'all') {
      whereConditions.push(eq(order.provider, providerFilter));
    }

    // 构建最终的where条件
    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;
    console.log('Where conditions:', whereConditions.length, 'conditions');
    console.log('Search field:', searchField, 'Search value:', searchValue);

    // 获取总数
    const totalResult = await db
      .select({ count: count() })
      .from(order)
      .leftJoin(user, eq(order.userId, user.id))
      .where(whereClause);
    
    const total = totalResult[0]?.count || 0;
    console.log('Total orders found:', total);

    // 构建排序
    let orderBy;
    switch (sortBy) {
      case 'id':
        orderBy = sortDirection === 'desc' ? desc(order.id) : asc(order.id);
        break;
      case 'userId':
        orderBy = sortDirection === 'desc' ? desc(order.userId) : asc(order.userId);
        break;
      case 'userEmail':
        orderBy = sortDirection === 'desc' ? desc(user.email) : asc(user.email);
        break;
      case 'amount':
        orderBy = sortDirection === 'desc' ? desc(order.amount) : asc(order.amount);
        break;
      case 'status':
        orderBy = sortDirection === 'desc' ? desc(order.status) : asc(order.status);
        break;
      case 'provider':
        orderBy = sortDirection === 'desc' ? desc(order.provider) : asc(order.provider);
        break;
      case 'createdAt':
      default:
        orderBy = sortDirection === 'desc' ? desc(order.createdAt) : asc(order.createdAt);
        break;
    }

    // 获取订单数据
    const orders = await db
      .select({
        id: order.id,
        userId: order.userId,
        amount: order.amount,
        currency: order.currency,
        planId: order.planId,
        status: order.status,
        provider: order.provider,
        providerOrderId: order.providerOrderId,
        metadata: order.metadata,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        // 关联用户信息
        userName: user.name,
        userEmail: user.email,
      })
      .from(order)
      .leftJoin(user, eq(order.userId, user.id))
      .where(whereClause)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      orders,
      total,
      page: Math.floor(offset / limit) + 1,
      pageSize: limit,
      totalPages: Math.ceil(total / limit)
    });

  } catch (error) {
    console.error('Error fetching orders:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 