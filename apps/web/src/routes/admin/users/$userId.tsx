import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createAdminUserEntitlementGrant, getAdminUser, getAdminUserEntitlements, listAdminAuditLogs, listAdminEntitlementPlans, revokeAdminEntitlementGrant, updateAdminUser } from '@douyin-keeper/sdk-ts'
import { Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@douyin-keeper/ui-web'

import { getToken } from '@/auth/session'
import { AdminGrantCreateForm, AdminUserGrantTable } from '@/features/admin/admin-entitlement-panels'
import { AdminAuditTable } from '@/features/admin/admin-audit-table'
import { ConfirmDialog } from '@/components/confirm-dialog'

export const Route = createFileRoute('/admin/users/$userId')({ component: AdminUserEntitlements })

function AdminUserEntitlements() {
  const token = getToken()
  const { userId } = Route.useParams()
  const queryClient = useQueryClient()
  const userQ = useQuery({
    queryKey: ['admin-user', userId],
    queryFn: () => getAdminUser(token as string, userId),
    enabled: !!token,
  })
  const entitlementsQ = useInfiniteQuery({
    queryKey: ['admin-user-entitlements', userId],
    queryFn: ({ pageParam }) => getAdminUserEntitlements(token as string, userId, { limit: 50, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled: !!token,
  })
  const auditQ = useInfiniteQuery({
    queryKey: ['admin-user-audit', userId],
    queryFn: ({ pageParam }) => listAdminAuditLogs(token as string, { resource_type: 'user', resource_id: userId, limit: 50, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled: !!token,
  })
  const plansQ = useQuery({
    queryKey: ['admin-entitlement-plans'],
    queryFn: () => listAdminEntitlementPlans(token as string),
    enabled: !!token,
  })
  const [statusTarget, setStatusTarget] = useState<'active' | 'disabled' | null>(null)
  const grantMutation = useMutation({
    mutationFn: (body: Parameters<typeof createAdminUserEntitlementGrant>[2]) => createAdminUserEntitlementGrant(token as string, userId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-user-entitlements', userId] })
      void queryClient.invalidateQueries({ queryKey: ['admin-user-audit', userId] })
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      void queryClient.invalidateQueries({ queryKey: ['admin-redemptions'] })
    },
  })
  const revokeMutation = useMutation({
    mutationFn: ({ grantId, reason }: { grantId: string; reason: string }) => revokeAdminEntitlementGrant(token as string, grantId, { reason }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-user-entitlements', userId] })
      void queryClient.invalidateQueries({ queryKey: ['admin-user-audit', userId] })
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      void queryClient.invalidateQueries({ queryKey: ['admin-redemptions'] })
    },
  })
  const statusMutation = useMutation({
    mutationFn: (status: 'active' | 'disabled') => updateAdminUser(token as string, userId, { status }),
    onSuccess: (updated) => {
      setStatusTarget(null)
      queryClient.setQueryData(['admin-user', userId], updated)
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      void queryClient.invalidateQueries({ queryKey: ['admin-user-entitlements', userId] })
      void queryClient.invalidateQueries({ queryKey: ['admin-user-audit', userId] })
    },
  })
  const user = userQ.data
  const grants = entitlementsQ.data?.pages.flatMap((page) => page.items) ?? []
  const auditLogs = auditQ.data?.pages.flatMap((page) => page.items) ?? []
  const plans = plansQ.data?.items ?? []
  const error = userQ.error ?? entitlementsQ.error ?? auditQ.error ?? plansQ.error ?? grantMutation.error ?? revokeMutation.error ?? statusMutation.error

  function toggleUserStatus() {
    if (!user) return
    const nextStatus = user.status === 'active' ? 'disabled' : 'active'
    setStatusTarget(nextStatus)
  }

  return <div className="space-y-8"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><Link to="/admin/users" className="text-sm text-muted-foreground hover:text-foreground">← 返回用户管理</Link><p className="mt-4 text-sm font-medium text-primary">控制台 · 用户授权</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">{user?.display_name || '用户授权'}</h1><p className="mt-2 text-sm text-muted-foreground">查看用户状态、授权与审计时间线，管理权益和访问权限。</p></div><Button variant="outline" onClick={() => { void userQ.refetch(); void entitlementsQ.refetch(); void auditQ.refetch(); void plansQ.refetch() }} disabled={userQ.isFetching || entitlementsQ.isFetching || auditQ.isFetching || plansQ.isFetching}>重新加载</Button></div>{error && <Card className="border-destructive/40"><CardContent className="py-4 text-sm text-destructive">{error instanceof Error ? error.message : '用户数据暂时不可用，请稍后重试。'}</CardContent></Card>}{userQ.isPending || entitlementsQ.isPending || auditQ.isPending || plansQ.isPending ? <DetailLoading /> : user ? <><Card><CardHeader className="flex flex-row items-start justify-between gap-4"><CardTitle className="text-base">用户信息</CardTitle><Button variant={user.status === 'active' ? 'destructive' : 'outline'} onClick={toggleUserStatus} disabled={statusMutation.isPending}>{statusMutation.isPending ? '处理中…' : user.status === 'active' ? '禁用用户' : '恢复用户'}</Button></CardHeader><CardContent className="grid gap-4 text-sm sm:grid-cols-3"><div><div className="text-muted-foreground">用户 ID</div><div className="mt-1 truncate font-mono text-xs" title={user.id}>{user.id}</div></div><div><div className="text-muted-foreground">角色 / 状态</div><div className="mt-1">{user.role === 'admin' ? '管理员' : '用户'} · {user.status === 'active' ? '正常' : '已停用'}</div></div><div><div className="text-muted-foreground">最近登录</div><div className="mt-1">{formatDate(user.last_login_at)}</div></div><div><div className="text-muted-foreground">账号 / 任务</div><div className="mt-1">{user.account_count} / {user.task_count}</div></div><div><div className="text-muted-foreground">权益到期</div><div className="mt-1">{formatDate(user.entitlement_expires_at)}</div></div><div><div className="text-muted-foreground">授权记录</div><div className="mt-1">{grants.length} 条{entitlementsQ.hasNextPage ? '（已加载部分）' : ''}</div></div></CardContent></Card><section className="space-y-3"><div><h2 className="text-lg font-semibold">人工授权</h2><p className="text-sm text-muted-foreground">新授权会按现有未撤销授权的到期时间顺延；已停用用户不能接收新授权。</p></div><Card><CardContent className="p-4"><AdminGrantCreateForm plans={plans} pending={grantMutation.isPending} disabled={user.status !== 'active'} onSubmit={(value) => grantMutation.mutate(value)} /></CardContent></Card></section><section className="space-y-3"><div><h2 className="text-lg font-semibold">授权时间线</h2><p className="text-sm text-muted-foreground">撤销只改变授权状态，保留原始记录用于审计。</p></div>{grants.length ? <><AdminUserGrantTable grants={grants} pendingGrantId={revokeMutation.isPending ? revokeMutation.variables?.grantId : undefined} onRevoke={(grantId, reason) => revokeMutation.mutate({ grantId, reason })} />{entitlementsQ.hasNextPage && <div className="flex justify-center"><Button variant="outline" onClick={() => void entitlementsQ.fetchNextPage()} disabled={entitlementsQ.isFetchingNextPage}>{entitlementsQ.isFetchingNextPage ? '加载中…' : '加载更多授权记录'}</Button></div>}</> : <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">暂无授权记录。</CardContent></Card>}</section><section className="space-y-3"><div><h2 className="text-lg font-semibold">审计记录</h2><p className="text-sm text-muted-foreground">仅展示动作摘要和脱敏状态，不开放原始详情 JSON。</p></div>{auditLogs.length ? <><AdminAuditTable logs={auditLogs} />{auditQ.hasNextPage && <div className="flex justify-center"><Button variant="outline" onClick={() => void auditQ.fetchNextPage()} disabled={auditQ.isFetchingNextPage}>{auditQ.isFetchingNextPage ? '加载中…' : '加载更多审计记录'}</Button></div>}</> : <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">暂无审计记录。</CardContent></Card>}</section></> : <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">用户不存在。</CardContent></Card>}<ConfirmDialog open={!!statusTarget} onOpenChange={(open) => { if (!open && !statusMutation.isPending) setStatusTarget(null) }} title={statusTarget === 'disabled' ? '禁用这个用户？' : '恢复这个用户？'} description={statusTarget === 'disabled' ? '禁用后，该用户无法继续访问用户端和管理端。' : '恢复后，用户可以重新登录并使用已生效的权益。'} impact={statusTarget === 'disabled' ? '现有 Web、Admin 和小程序会话会立即失效；恢复用户不会自动恢复旧会话。' : '用户需要重新登录，已有权益与审计记录会保留。'} confirmLabel={statusTarget === 'disabled' ? '确认禁用' : '确认恢复'} confirmVariant={statusTarget === 'disabled' ? 'destructive' : 'default'} pending={statusMutation.isPending} onConfirm={() => { if (statusTarget) statusMutation.mutate(statusTarget) }} /></div>
}

function DetailLoading() {
  return <Card><CardHeader><Skeleton className="h-5 w-32" /></CardHeader><CardContent className="space-y-3"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></CardContent></Card>
}

function formatDate(value: string | null | undefined) {
  if (!value) return '暂无'
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(value))
}
