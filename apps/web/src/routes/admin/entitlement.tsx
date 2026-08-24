import { Outlet, createFileRoute, useLocation } from '@tanstack/react-router'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createAdminCardBatch, createAdminEntitlementPlan, disableAdminCardBatch, disableAdminEntitlementPlan, listAdminCardBatches, listAdminEntitlementPlans, listAdminRedemptions } from '@douyin-keeper/sdk-ts'
import { Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@douyin-keeper/ui-web'
import { useState } from 'react'

import { getToken } from '@/auth/session'
import { AdminBatchTable, AdminPlanTable, AdminRedemptionTable, BatchCreateForm, PlanCreateForm } from '@/features/admin/admin-entitlement-panels'

export const Route = createFileRoute('/admin/entitlement')({ component: AdminEntitlement })

function AdminEntitlement() {
  const location = useLocation()
  return location.pathname === '/admin/entitlement' ? <AdminEntitlementList /> : <Outlet />
}

function AdminEntitlementList() {
  const token = getToken()
  const queryClient = useQueryClient()
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([])
  const plansQ = useQuery({ queryKey: ['admin-entitlement-plans'], queryFn: () => listAdminEntitlementPlans(token as string), enabled: !!token })
  const batchesQ = useInfiniteQuery({
    queryKey: ['admin-card-batches'],
    queryFn: ({ pageParam }) => listAdminCardBatches(token as string, { limit: 50, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled: !!token,
  })
  const redemptionsQ = useInfiniteQuery({
    queryKey: ['admin-redemptions'],
    queryFn: ({ pageParam }) => listAdminRedemptions(token as string, { limit: 50, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled: !!token,
  })
  const planMutation = useMutation({ mutationFn: (body: Parameters<typeof createAdminEntitlementPlan>[1]) => createAdminEntitlementPlan(token as string, body), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-entitlement-plans'] }) })
  const disablePlanMutation = useMutation({ mutationFn: (id: string) => disableAdminEntitlementPlan(token as string, id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-entitlement-plans'] }) })
  const batchMutation = useMutation({ mutationFn: (body: Parameters<typeof createAdminCardBatch>[1]) => createAdminCardBatch(token as string, body), onSuccess: (result) => { setGeneratedCodes(result.codes); void queryClient.invalidateQueries({ queryKey: ['admin-card-batches'] }) } })
  const disableBatchMutation = useMutation({ mutationFn: (id: string) => disableAdminCardBatch(token as string, id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-card-batches'] }) })
  const plans = plansQ.data?.items ?? []
  const batches = batchesQ.data?.pages.flatMap((page) => page.items) ?? []
  const redemptions = redemptionsQ.data?.pages.flatMap((page) => page.items) ?? []
  const error = planMutation.error ?? disablePlanMutation.error ?? batchMutation.error ?? disableBatchMutation.error ?? plansQ.error ?? batchesQ.error ?? redemptionsQ.error

  async function reload() {
    await Promise.all([plansQ.refetch(), batchesQ.refetch(), redemptionsQ.refetch()])
  }

  function downloadCodes() {
    const csv = ['code', ...generatedCodes].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'douyin-keeper-card-codes.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return <div className="space-y-8"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-primary">控制台 · 权益</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">权益与卡密</h1><p className="mt-2 text-sm text-muted-foreground">管理授权方案、一次性卡密批次和兑换事实；数据库只保存卡密摘要。</p></div><Button variant="outline" onClick={() => void reload()} disabled={plansQ.isFetching || batchesQ.isFetching || redemptionsQ.isFetching}>重新加载</Button></div>{error && <Card className="border-destructive/40"><CardContent className="py-4 text-sm text-destructive">{error instanceof Error ? error.message : '权益数据暂时不可用，请稍后重试。'}</CardContent></Card>}<section className="space-y-3"><div><h2 className="text-lg font-semibold">权益方案</h2><p className="text-sm text-muted-foreground">停用只阻止新的发行与兑换，不影响已存在的授权。</p></div><Card><CardContent className="p-4"><PlanCreateForm pending={planMutation.isPending} onSubmit={(value) => planMutation.mutate(value)} /></CardContent></Card>{plansQ.isPending ? <ListLoading /> : plans.length ? <AdminPlanTable plans={plans} pendingPlanId={disablePlanMutation.isPending ? disablePlanMutation.variables : undefined} onDisable={(id) => disablePlanMutation.mutate(id)} /> : <EmptyState text="暂无权益方案。" />}</section><section className="space-y-3"><div><h2 className="text-lg font-semibold">卡密批次</h2><p className="text-sm text-muted-foreground">明文卡密仅在生成成功后显示一次；刷新页面后无法找回。</p></div><Card><CardContent className="p-4"><BatchCreateForm plans={plans} pending={batchMutation.isPending} onSubmit={(value) => batchMutation.mutate(value)} /></CardContent></Card>{generatedCodes.length > 0 && <Card className="border-primary/30"><CardHeader><CardTitle className="text-base">本次生成的卡密（仅当前页面会话可见）</CardTitle></CardHeader><CardContent><div className="max-h-48 overflow-auto rounded-md bg-muted p-3 font-mono text-xs">{generatedCodes.map((code) => <div key={code}>{code}</div>)}</div><div className="mt-3 flex gap-2"><Button size="sm" onClick={downloadCodes}>下载 CSV</Button><Button size="sm" variant="ghost" onClick={() => setGeneratedCodes([])}>清除明文</Button></div></CardContent></Card>}{batchesQ.isPending ? <ListLoading /> : batches.length ? <><AdminBatchTable batches={batches} pendingBatchId={disableBatchMutation.isPending ? disableBatchMutation.variables : undefined} onDisable={(id) => disableBatchMutation.mutate(id)} />{batchesQ.hasNextPage && <div className="flex justify-center"><Button variant="outline" onClick={() => void batchesQ.fetchNextPage()} disabled={batchesQ.isFetchingNextPage}>{batchesQ.isFetchingNextPage ? '加载中…' : '加载更多批次'}</Button></div>}</> : <EmptyState text="暂无卡密批次。" />}</section><section className="space-y-3"><div><h2 className="text-lg font-semibold">兑换记录</h2><p className="text-sm text-muted-foreground">只展示卡密指纹和授权状态，不展示完整卡密。</p></div>{redemptionsQ.isPending ? <ListLoading /> : redemptions.length ? <><AdminRedemptionTable redemptions={redemptions} />{redemptionsQ.hasNextPage && <div className="flex justify-center"><Button variant="outline" onClick={() => void redemptionsQ.fetchNextPage()} disabled={redemptionsQ.isFetchingNextPage}>{redemptionsQ.isFetchingNextPage ? '加载中…' : '加载更多兑换记录'}</Button></div>}</> : <EmptyState text="暂无兑换记录。" />}</section></div>
}

function ListLoading() {
  return <Card><CardHeader><Skeleton className="h-5 w-32" /></CardHeader><CardContent className="space-y-3"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></CardContent></Card>
}

function EmptyState({ text }: { text: string }) {
  return <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">{text}</CardContent></Card>
}
