import { createFileRoute } from '@tanstack/react-router'
import { withCfDb } from '@/lib/with-request-db'

export const Route = createFileRoute('/api/admin/users/delete/')({
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

          if (!id) {
            return Response.json({ error: 'User ID is required' }, { status: 400 })
          }

          const existingUser = await db.select({ id: user.id }).from(user).where(eq(user.id, id))
          if (!existingUser || existingUser.length === 0) {
            return Response.json({ error: 'User not found' }, { status: 404 })
          }

          await db.delete(user).where(eq(user.id, id))

          return Response.json({ success: true })
        } catch (error) {
          console.error('Error deleting user:', error)
          return Response.json({ error: 'Failed to delete user' }, { status: 500 })
        }
      }),
    },
  },
})
