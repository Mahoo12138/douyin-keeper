import { db } from '@libs/database';
import { withdrawal, user } from '@libs/database/schema';
import { eq, desc, count, like, and } from 'drizzle-orm';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '10') || 10;
    const page = parseInt(url.searchParams.get('page') || '1') || 1;
    const offset = parseInt(url.searchParams.get('offset') || '') || (page - 1) * limit;
    const searchValue = url.searchParams.get('searchValue') || url.searchParams.get('search') || undefined;
    const searchField = url.searchParams.get('searchField') || 'userEmail';
    const status = url.searchParams.get('status') || undefined;

    const whereConditions: any[] = [];
    if (status) whereConditions.push(eq(withdrawal.status, status));
    if (searchValue) {
      switch (searchField) {
        case 'userEmail':
          whereConditions.push(like(user.email, `%${searchValue}%`));
          break;
        case 'userName':
          whereConditions.push(like(user.name, `%${searchValue}%`));
          break;
        case 'paymentAccount':
          whereConditions.push(like(withdrawal.paymentAccount, `%${searchValue}%`));
          break;
        default:
          whereConditions.push(like(user.email, `%${searchValue}%`));
      }
    }
    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

    const baseQuery = db.select({
      id: withdrawal.id, userId: withdrawal.userId, amount: withdrawal.amount,
      currency: withdrawal.currency, paymentMethod: withdrawal.paymentMethod,
      paymentAccount: withdrawal.paymentAccount, status: withdrawal.status,
      adminNote: withdrawal.adminNote, processedAt: withdrawal.processedAt,
      processedBy: withdrawal.processedBy, createdAt: withdrawal.createdAt,
      userEmail: user.email, userName: user.name,
    }).from(withdrawal).leftJoin(user, eq(withdrawal.userId, user.id));

    const countQuery = db.select({ count: count() }).from(withdrawal).leftJoin(user, eq(withdrawal.userId, user.id));

    const [totalResult, withdrawals] = await Promise.all([
      whereClause ? countQuery.where(whereClause) : countQuery,
      whereClause
        ? baseQuery.where(whereClause).orderBy(desc(withdrawal.createdAt)).limit(limit).offset(offset)
        : baseQuery.orderBy(desc(withdrawal.createdAt)).limit(limit).offset(offset),
    ]);

    return Response.json({
      withdrawals, total: totalResult[0]?.count || 0,
      page, pageSize: limit, totalPages: Math.ceil((totalResult[0]?.count || 0) / limit),
    });
  } catch (error) {
    console.error('Failed to fetch admin withdrawals:', error);
    return Response.json({ error: 'Failed to fetch withdrawals' }, { status: 500 });
  }
}
