import { NextRequest, NextResponse } from 'next/server'
import { db } from '@libs/database/client'
import { user } from '@libs/database/schema/user'
import { eq } from 'drizzle-orm'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const id = formData.get('id') as string

    if (!id) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    // Check if user exists
    const existingUser = await db.select({ id: user.id }).from(user).where(eq(user.id, id))
    if (!existingUser || existingUser.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Delete the user
    await db.delete(user).where(eq(user.id, id))

    // Redirect to users list
    return NextResponse.redirect(new URL('/admin/users', request.url))
  } catch (error) {
    console.error('Error deleting user:', error)
    return NextResponse.json(
      { error: 'Failed to delete user' },
      { status: 500 }
    )
  }
} 