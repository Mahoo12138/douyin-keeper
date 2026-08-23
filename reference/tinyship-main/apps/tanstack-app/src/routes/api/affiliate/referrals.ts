import { createFileRoute } from '@tanstack/react-router'
import { withCfDb } from '@/lib/with-request-db'

export const Route = createFileRoute('/api/affiliate/referrals')({
  server: {
    handlers: {
      GET: withCfDb(async ({ request }) => {
        try {
          const { auth } = await import('@libs/auth')
          const { generateReferralCode } = await import('@libs/affiliate')
          const { db } = await import('@libs/database')
          const { user } = await import('@libs/database/schema')
          const { eq, desc, count } = await import('drizzle-orm')

          const session = await auth.api.getSession({ headers: new Headers(request.headers) })
          if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

          const url = new URL(request.url)
          const page = parseInt(url.searchParams.get('page') || '1') || 1
          const limit = parseInt(url.searchParams.get('limit') || '10') || 10
          const offset = (page - 1) * limit

          const referralCode = await generateReferralCode(session.user.id)

          const [totalResult, referrals] = await Promise.all([
            db.select({ count: count() }).from(user).where(eq(user.referredByCode, referralCode)),
            db.select({ id: user.id, name: user.name, email: user.email, createdAt: user.createdAt })
              .from(user).where(eq(user.referredByCode, referralCode))
              .orderBy(desc(user.createdAt)).limit(limit).offset(offset),
          ])

          const total = totalResult[0]?.count || 0
          const maskedReferrals = referrals.map(r => ({
            ...r,
            email: r.email.replace(/(.{2}).*(@.*)/, '$1***$2'),
            name: r.name ? r.name.substring(0, 2) + '***' : null,
          }))

          return Response.json({ referrals: maskedReferrals, total, page, pageSize: limit, totalPages: Math.ceil(total / limit) })
        } catch (error) {
          console.error('Failed to fetch referrals:', error)
          return Response.json({ error: 'Failed to fetch referrals' }, { status: 500 })
        }
      }),
    },
  },
})
