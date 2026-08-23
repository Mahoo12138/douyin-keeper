import { auth } from '@libs/auth';
import { db } from '@libs/database';
import { commission, user } from '@libs/database/schema';
import { eq, desc, count, inArray } from 'drizzle-orm';

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

    const [totalResult, rawCommissions] = await Promise.all([
      db.select({ count: count() }).from(commission).where(eq(commission.referrerId, session.user.id)),
      db.select().from(commission).where(eq(commission.referrerId, session.user.id))
        .orderBy(desc(commission.createdAt)).limit(limit).offset(offset),
    ]);

    // Batch-fetch buyer info for all commissions
    const buyerIds = [...new Set(rawCommissions.map(c => c.buyerId).filter(Boolean))];
    const buyerMap = new Map<string, { name: string | null; email: string }>();
    if (buyerIds.length > 0) {
      const buyers = await db.select({ id: user.id, name: user.name, email: user.email })
        .from(user).where(inArray(user.id, buyerIds));
      for (const b of buyers) {
        buyerMap.set(b.id, { name: b.name, email: b.email });
      }
    }

    const commissions = rawCommissions.map(c => ({
      ...c,
      buyer: buyerMap.get(c.buyerId) || null,
    }));

    const total = totalResult[0]?.count || 0;
    return Response.json({ commissions, total, page, pageSize: limit, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error('Failed to fetch commissions:', error);
    return Response.json({ error: 'Failed to fetch commissions' }, { status: 500 });
  }
}
