import { NextRequest, NextResponse } from 'next/server';
import { db } from '@libs/database';
import { user } from '@libs/database/schema/user';
import { eq, and, like, desc, asc, count, inArray } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    console.log('Users API called with params:', Object.fromEntries(searchParams.entries()));
    
    // 分页参数
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = parseInt(searchParams.get('offset') || '0');
    
    // 搜索参数
    const searchField = searchParams.get('searchField');
    const searchValue = searchParams.get('searchValue');
    
    // 筛选参数
    const roleFilter = searchParams.get('role');
    const bannedFilter = searchParams.get('banned');
    
    // 排序参数
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortDirection = searchParams.get('sortDirection') || 'desc';

    // 构建查询条件
    let whereConditions: any[] = [];

    // 搜索条件
    if (searchValue && searchField) {
      switch (searchField) {
        case 'id':
          whereConditions.push(eq(user.id, searchValue));
          break;
        case 'email':
          whereConditions.push(like(user.email, `%${searchValue}%`));
          break;
        case 'name':
          whereConditions.push(like(user.name, `%${searchValue}%`));
          break;
      }
    }

    // 角色筛选
    if (roleFilter && roleFilter !== 'all') {
      whereConditions.push(eq(user.role, roleFilter));
    }

    // 封禁状态筛选
    if (bannedFilter && bannedFilter !== 'all') {
      const isBanned = bannedFilter === 'true';
      whereConditions.push(eq(user.banned, isBanned));
    }

    // 构建最终的where条件
    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;
    console.log('Where conditions:', whereConditions.length, 'conditions');
    console.log('Search field:', searchField, 'Search value:', searchValue);

    // 获取总数
    const totalResult = await db
      .select({ count: count() })
      .from(user)
      .where(whereClause);
    
    const total = totalResult[0]?.count || 0;
    console.log('Total users found:', total);

    // 构建排序
    let orderBy;
    switch (sortBy) {
      case 'id':
        orderBy = sortDirection === 'desc' ? desc(user.id) : asc(user.id);
        break;
      case 'name':
        orderBy = sortDirection === 'desc' ? desc(user.name) : asc(user.name);
        break;
      case 'email':
        orderBy = sortDirection === 'desc' ? desc(user.email) : asc(user.email);
        break;
      case 'role':
        orderBy = sortDirection === 'desc' ? desc(user.role) : asc(user.role);
        break;
      case 'updatedAt':
        orderBy = sortDirection === 'desc' ? desc(user.updatedAt) : asc(user.updatedAt);
        break;
      case 'createdAt':
      default:
        orderBy = sortDirection === 'desc' ? desc(user.createdAt) : asc(user.createdAt);
        break;
    }

    // 获取用户数据
    const users = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        image: user.image,
        emailVerified: user.emailVerified,
        phoneNumber: user.phoneNumber,
        phoneNumberVerified: user.phoneNumberVerified,
        banned: user.banned,
        banReason: user.banReason,
        banExpires: user.banExpires,
        referralCode: user.referralCode,
        referredByCode: user.referredByCode,
        commissionBalance: user.commissionBalance,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })
      .from(user)
      .where(whereClause)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    // Resolve referredByCode → referrer user info
    const codes = [...new Set(users.map(u => u.referredByCode).filter(Boolean))] as string[];
    let referrerMap: Record<string, { name: string | null; email: string }> = {};
    if (codes.length > 0) {
      const referrers = await db
        .select({ referralCode: user.referralCode, name: user.name, email: user.email })
        .from(user)
        .where(inArray(user.referralCode, codes));
      referrerMap = Object.fromEntries(
        referrers.map(r => [r.referralCode!, { name: r.name, email: r.email }])
      );
    }

    const enrichedUsers = users.map(u => ({
      ...u,
      referredBy: u.referredByCode ? referrerMap[u.referredByCode] || null : null,
    }));

    return NextResponse.json({
      users: enrichedUsers,
      total,
      page: Math.floor(offset / limit) + 1,
      pageSize: limit,
      totalPages: Math.ceil(total / limit)
    });

  } catch (error) {
    console.error('Error fetching users:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 