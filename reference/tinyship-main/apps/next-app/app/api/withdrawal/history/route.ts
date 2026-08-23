import { auth } from '@libs/auth';
import { db } from '@libs/database';
import { withdrawal } from '@libs/database/schema';
import { eq, desc, count } from 'drizzle-orm';

export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: new Headers(request.headers) });
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1') || 1;
    const limit = parseInt(url.searchParams.get('limit') || '10') || 10;
    const offset = (page - 1) * limit;

    const [totalResult, withdrawals] = await Promise.all([
      db.select({ count: count() }).from(withdrawal).where(eq(withdrawal.userId, session.user.id)),
      db.select().from(withdrawal).where(eq(withdrawal.userId, session.user.id))
        .orderBy(desc(withdrawal.createdAt)).limit(limit).offset(offset),
    ]);

    const total = totalResult[0]?.count || 0;
    return Response.json({ withdrawals, total, page, pageSize: limit, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error('Failed to fetch withdrawal history:', error);
    return Response.json({ error: 'Failed to fetch withdrawal history' }, { status: 500 });
  }
}
