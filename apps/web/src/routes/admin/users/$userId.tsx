import { createFileRoute, Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createAdminUserEntitlementGrant, getAdminUserEntitlements, listAdminEntitlementPlans, revokeAdminEntitlementGrant } from '@douyin-keeper/sdk-ts'
import { Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@douyin-keeper/ui-web'

import { getToken } from '@/auth/session'
import { AdminGrantCreateForm, AdminUserGrantTable } from '@/features/admin/admin-entitlement-panels'

export const Route = createFileRoute('/admin/users/$userId')({ component: AdminUserEntitlements })

function AdminUserEntitlements() {
  const token = getToken()
  const { userId } = Route.useParams()
  const queryClient = useQueryClient()
  const userQ = useQuery({
    queryKey: ['admin-user-entitlements', userId],
    queryFn: () => getAdminUserEntitlements(token as string, userId, { limit: 100 }),
    enabled: !!token,
  })
  const plansQ = useQuery({
    queryKey: ['admin-entitlement-plans'],
    queryFn: () => listAdminEntitlementPlans(token as string),
    enabled: !!token,
  })
  const grantMutation = useMutation({
    mutationFn: (body: Parameters<typeof createAdminUserEntitlementGrant>[2]) => createAdminUserEntitlementGrant(token as string, userId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-user-entitlements', userId] })
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      void queryClient.invalidateQueries({ queryKey: ['admin-redemptions'] })
    },
  })
  const revokeMutation = useMutation({
    mutationFn: ({ grantId, reason }: { grantId: string; reason: string }) => revokeAdminEntitlementGrant(token as string, grantId, { reason }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-user-entitlements', userId] })
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      void queryClient.invalidateQueries({ queryKey: ['admin-redemptions'] })
    },
  })
  const user = userQ.data?.user
  const grants = userQ.data?.items ?? []
  const plans = plansQ.data?.items ?? []
  const error = userQ.error ?? plansQ.error ?? grantMutation.error ?? revokeMutation.error

  return <div className="space-y-8"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><Link to="/admin/users" className="text-sm text-muted-foreground hover:text-foreground">← 返回用户管理</Link><p className="mt-4 text-sm font-medium text-primary">控制台 · 用户授权</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">{user?.display_name || '用户授权'}</h1><p className="mt-2 text-sm text-muted-foreground">查看授权时间线，或为该用户人工授予一段权益。</p></div><Button variant="outline" onClick={() => { void userQ.refetch(); void plansQ.refetch() }} disabled={userQ.isFetching || plansQ.isFetching}>重新加载</Button></div>{error && <Card className="border-destructive/40"><CardContent className="py-4 text-sm text-destructive">{error instanceof Error ? error.message : '授权数据暂时不可用，请稍后重试。'}</CardContent></Card>}{userQ.isPending || plansQ.isPending ? <DetailLoading /> : user ? <><Card><CardHeader><CardTitle className="text-base">用户信息</CardTitle></CardHeader><CardContent className="grid gap-3 text-sm sm:grid-cols-3"><div><div className="text-muted-foreground">用户 ID</div><div className="mt-1 truncate font-mono text-xs" title={user.id}>{user.id}</div></div><div><div className="text-muted-foreground">状态</div><div className="mt-1">{user.status === 'active' ? '正常' : '已停用'}</div></div><div><div className="text-muted-foreground">授权记录</div><div className="mt-1">{grants.length} 条</div></div></CardContent></Card><section className="space-y-3"><div><h2 className="text-lg font-semibold">人工授权</h2><p className="text-sm text-muted-foreground">新授权会按现有未撤销授权的到期时间顺延；已停用用户不能接收新授权。</p></div><Card><CardContent className="p-4"><AdminGrantCreateForm plans={plans} pending={grantMutation.isPending} disabled={user.status !== 'active'} onSubmit={(value) => grantMutation.mutate(value)} /></CardContent></Card></section><section className="space-y-3"><div><h2 className="text-lg font-semibold">授权时间线</h2><p className="text-sm text-muted-foreground">撤销只改变授权状态，保留原始记录用于审计。</p></div>{grants.length ? <AdminUserGrantTable grants={grants} pendingGrantId={revokeMutation.isPending ? revokeMutation.variables?.grantId : undefined} onRevoke={(grantId, reason) => revokeMutation.mutate({ grantId, reason })} /> : <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">暂无授权记录。</CardContent></Card>}</section></> : <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">用户不存在。</CardContent></Card>}</div>
}

function DetailLoading() {
  return <Card><CardHeader><Skeleton className="h-5 w-32" /></CardHeader><CardContent className="space-y-3"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></CardContent></Card>
}
