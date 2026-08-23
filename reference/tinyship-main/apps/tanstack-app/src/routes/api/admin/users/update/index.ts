import { createFileRoute } from '@tanstack/react-router'
import { withCfDb } from '@/lib/with-request-db'

export const Route = createFileRoute('/api/admin/users/update/')({
  server: {
    handlers: {
      POST: withCfDb(async ({ request }) => {
        try {
          const { requireAdminAPI } = await import('@/lib/api-auth')
          const authResult = await requireAdminAPI(request)
          if (authResult instanceof Response) return authResult

          const { db } = await import('@libs/database/client')
          const { user } = await import('@libs/database/schema/user')
          const { eq } = await import('drizzle-orm')

          const formData = await request.formData()

          const id = formData.get('id') as string
          const name = formData.get('name') as string
          const role = formData.get('role') as string
          const image = formData.get('image') as string
          const phoneNumber = formData.get('phoneNumber') as string
          const banReason = formData.get('banReason') as string
          const banExpires = formData.get('banExpires') as string

          const emailVerified = formData.get('emailVerified') === 'on'
          const banned = formData.get('banned') === 'on'
          const phoneNumberVerified = formData.get('phoneNumberVerified') === 'on'

          const existingUser = await db.select({ id: user.id }).from(user).where(eq(user.id, id))
          if (!existingUser || existingUser.length === 0) {
            return Response.json({ error: 'User not found' }, { status: 404 })
          }

          await db
            .update(user)
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

          return Response.json({ success: true })
        } catch (error) {
          console.error('Error updating user:', error)
          return Response.json({ error: 'Failed to update user' }, { status: 500 })
        }
      }),
    },
  },
})
