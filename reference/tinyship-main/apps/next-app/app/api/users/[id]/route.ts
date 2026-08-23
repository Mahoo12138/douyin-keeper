import { NextRequest, NextResponse } from 'next/server';
import { authMiddleware } from '@/middlewares/authMiddleware';
import { db } from '@libs/database';
import { user } from '@libs/database/schema/user';
import { eq } from 'drizzle-orm';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    // Get user data from database
    const userData = await db
      .select()
      .from(user)
      .where(eq(user.id, id))
      .then(rows => rows[0]);

    if (!userData) {
      return new NextResponse('User not found', { status: 404 });
    }

    return NextResponse.json(userData);
  } catch (error) {
    console.error('Error fetching user:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();
    
    // Update user data in database
    await db
      .update(user)
      .set({
        name: body.name,
        image: body.image || null,
        phoneNumber: body.phoneNumber || null,
        emailVerified: body.emailVerified,
        phoneNumberVerified: body.phoneNumberVerified,
        role: body.role,
        banned: body.banned,
        banReason: body.banReason || null,
        updatedAt: new Date(),
      })
      .where(eq(user.id, id));


    return NextResponse.json({ message: 'User updated successfully' });
  } catch (error) {
    console.error('Error updating user:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}