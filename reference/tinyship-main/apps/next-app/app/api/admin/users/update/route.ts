import { NextRequest, NextResponse } from 'next/server'
import { db } from '@libs/database/client'
import { user } from '@libs/database/schema/user'
import { eq } from 'drizzle-orm'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    
    // Extract form data
    const id = formData.get('id') as string
    const name = formData.get('name') as string
    const role = formData.get('role') as string
    const image = formData.get('image') as string
    const phoneNumber = formData.get('phoneNumber') as string
    const banReason = formData.get('banReason') as string
    const banExpires = formData.get('banExpires') as string
    
    // Boolean fields need special handling from form data
    const emailVerified = formData.get('emailVerified') === 'on'
    const banned = formData.get('banned') === 'on'
    const phoneNumberVerified = formData.get('phoneNumberVerified') === 'on'
    
    // Check if user exists
    const existingUser = await db.select({ id: user.id }).from(user).where(eq(user.id, id))
    if (!existingUser || existingUser.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }
    
    // Update the user
    await db.update(user)
      .set({
        name,
        role,
        image: image || null,
        phoneNumber: phoneNumber || null,
        emailVerified,
        banned,
        banReason: banReason || null,
        banExpires: banExpires ? banExpires : null,
        phoneNumberVerified,
        updatedAt: new Date(),
      })
      .where(eq(user.id, id))
    
    // Redirect back to user detail page
    return NextResponse.redirect(new URL(`/admin/users/${id}`, request.url))
  } catch (error) {
    console.error('Error updating user:', error)
    return NextResponse.json(
      { error: 'Failed to update user' },
      { status: 500 }
    )
  }
} 