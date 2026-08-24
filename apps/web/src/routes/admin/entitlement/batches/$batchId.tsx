import { createFileRoute, Link } from '@tanstack/react-router'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getAdminCardBatch, listAdminCardCodes, revokeAdminCardCode } from '@douyin-keeper/sdk-ts'
import { Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@douyin-keeper/ui-web'

import { getToken } from '@/auth/session'
import { AdminCardCodeTable } from '@/features/admin/admin-entitlement-panels'

export const Route = createFileRoute('/admin/entitlement/batches/$batchId')({ component: AdminCardBatchDetail })

function AdminCardBatchDetail() {
  const token = getToken()
  const { batchId } = Route.useParams()
  const queryClient = useQueryClient()
  const batchQ = useQuery({
    queryKey: ['admin-card-batch', batchId],
    queryFn: () => getAdminCardBatch(token as string, batchId),
    enabled: !!token,
  })
  const codesQ = useInfiniteQuery({
    queryKey: ['admin-card-codes', batchId],
    queryFn: ({ pageParam }) => listAdminCardCodes(token as string, batchId, { limit: 50, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled: !!token,
  })
  const revokeMutation = useMutation({
    mutationFn: ({ codeId, reason }: { codeId: number; reason: string }) => revokeAdminCardCode(token as string, batchId, codeId, { reason }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-card-batch', batchId] })
      void queryClient.invalidateQueries({ queryKey: ['admin-card-codes', batchId] })
      void queryClient.invalidateQueries({ queryKey: ['admin-card-batches'] })
    },
  })
  const error = batchQ.error ?? codesQ.error ?? revokeMutation.error
  const batch = batchQ.data
  const codes = codesQ.data?.pages.flatMap((page) => page.items) ?? []

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Link to="/admin/entitlement" className="text-sm text-muted-foreground hover:text-foreground">
            ← 返回权益与卡密
          </Link>
          <p className="mt-4 text-sm font-medium text-primary">控制台 · 卡密批次</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{batch?.name || '卡密批次'}</h1>
          <p className="mt-2 text-sm text-muted-foreground">仅展示卡密指纹；明文卡密不会在批次详情中出现。</p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            void batchQ.refetch()
            void codesQ.refetch()
          }}
          disabled={batchQ.isFetching || codesQ.isFetching}
        >
          重新加载
        </Button>
      </div>
      {error && (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive">
            {error instanceof Error ? error.message : '卡密数据暂时不可用，请稍后重试。'}
          </CardContent>
        </Card>
      )}
      {batchQ.isPending ? (
        <BatchLoading />
      ) : batch ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">批次概览</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm sm:grid-cols-4">
              <div>
                <div className="text-muted-foreground">权益方案</div>
                <div className="mt-1 font-medium">{batch.plan_name} · {batch.plan_code}</div>
              </div>
              <div>
                <div className="text-muted-foreground">有效期</div>
                <div className="mt-1">{batch.duration_days} 天</div>
              </div>
              <div>
                <div className="text-muted-foreground">使用情况</div>
                <div className="mt-1">{batch.redeemed_count} / {batch.quantity} 已兑换</div>
              </div>
              <div>
                <div className="text-muted-foreground">状态</div>
                <div className="mt-1">{batch.status === 'active' ? '启用' : '已停用'}</div>
              </div>
            </CardContent>
          </Card>
          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">卡密明细</h2>
              <p className="text-sm text-muted-foreground">只允许撤销未使用卡密，撤销需要填写原因并写入审计日志。</p>
            </div>
            {codesQ.isPending ? (
              <BatchLoading />
            ) : codes.length ? (
              <>
                <AdminCardCodeTable
                  codes={codes}
                  pendingCodeId={revokeMutation.isPending ? revokeMutation.variables?.codeId : undefined}
                  onRevoke={(codeId, reason) => revokeMutation.mutate({ codeId, reason })}
                />
                {codesQ.hasNextPage && (
                  <div className="flex justify-center">
                    <Button
                      variant="outline"
                      onClick={() => void codesQ.fetchNextPage()}
                      disabled={codesQ.isFetchingNextPage}
                    >
                      {codesQ.isFetchingNextPage ? '加载中…' : '加载更多卡密'}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-sm text-muted-foreground">暂无卡密明细。</CardContent>
              </Card>
            )}
          </section>
        </>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">批次不存在。</CardContent>
        </Card>
      )}
    </div>
  )
}

function BatchLoading() {
  return <Card><CardHeader><Skeleton className="h-5 w-32" /></CardHeader><CardContent className="space-y-3"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></CardContent></Card>
}
