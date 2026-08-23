import { createFileRoute } from '@tanstack/react-router'
import { withCfDb } from '@/lib/with-request-db'

export const Route = createFileRoute('/api/admin/withdrawals/$id')({
  server: {
    handlers: {
      PATCH: withCfDb(async ({ request, params }: { request: Request; params: { id: string } }) => {
        try {
          const { requireAdminAPI } = await import('@/lib/api-auth')
          const authResult = await requireAdminAPI(request)
          if (authResult instanceof Response) return authResult

          const { processWithdrawal } = await import('@libs/affiliate')

          const body = await request.json()
          const { status, adminNote } = body as { status: string; adminNote?: string }

          if (!['processing', 'completed', 'rejected'].includes(status)) {
            return Response.json({ error: 'Invalid status' }, { status: 400 })
          }

          const result = await processWithdrawal({
            withdrawalId: params.id,
            status: status as 'processing' | 'completed' | 'rejected',
            adminNote,
            processedBy: authResult.user.id,
          })

          if (!result.success) {
            return Response.json({ error: result.error }, { status: 400 })
          }

          return Response.json({ success: true })
        } catch (error) {
          console.error('Failed to process withdrawal:', error)
          return Response.json({ error: 'Failed to process withdrawal' }, { status: 500 })
        }
      }),
    },
  },
})
