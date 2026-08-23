import { NextRequest, NextResponse } from 'next/server';
import { auth } from "@libs/auth";
import { headers } from 'next/headers';
import { db } from '@libs/database';
import { order } from '@libs/database/schema/order';
import { eq, desc, sql } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    // Get current user session (authMiddleware verifies user is logged in)
    const session = await auth.api.getSession({
      headers: await headers()
    });

    const userId = session!.user!.id;

    // Parse pagination parameters
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10), 100);
    const offset = (page - 1) * limit;

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(order)
      .where(eq(order.userId, userId));
    
    const total = countResult[0]?.count || 0;

    // Get paginated orders, ordered by creation date (newest first)
    const userOrders = await db.select({
      id: order.id,
      amount: order.amount,
      currency: order.currency,
      planId: order.planId,
      status: order.status,
      provider: order.provider,
      providerOrderId: order.providerOrderId,
      metadata: order.metadata,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    }).from(order)
      .where(eq(order.userId, userId))
      .orderBy(desc(order.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      orders: userOrders,
      total,
      page,
      pageSize: limit,
      totalPages: Math.ceil(total / limit)
    });

  } catch (error) {
    console.error('Error fetching user orders:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 