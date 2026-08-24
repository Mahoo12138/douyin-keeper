import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listAdminAccounts, pauseAdminAccount, resumeAdminAccount } from '@douyin-keeper/sdk-ts'
import { Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@douyin-keeper/ui-web'

import { getToken } from '@/auth/session'
import { AdminAccountTable } from '@/features/admin/admin-account-table'

export const Route = createFileRoute('/admin/accounts')({ component: AdminAccounts })

function AdminAccounts() {
  const token = getToken()
  const queryClient = useQueryClient()
  const accountsQ = useQuery({
    queryKey: ['admin-accounts'],
    queryFn: () => listAdminAccounts(token as string, { limit: 100 }),
    enabled: !!token,
  })
  const pauseMutation = useMutation({
    mutationFn: ({ accountId, paused }: { accountId: string; paused: boolean }) => paused ? pauseAdminAccount(token as string, accountId) : resumeAdminAccount(token as string, accountId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-accounts'] }),
  })
  const accounts = accountsQ.data?.items ?? []

  return <div className="space-y-8"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-primary">控制台 · 资源</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">抖音账号</h1><p className="mt-2 text-sm text-muted-foreground">查看账号归属、登录状态、风险、能力快照和今日发送情况。</p></div><Button variant="outline" onClick={() => void accountsQ.refetch()} disabled={accountsQ.isFetching}>重新加载</Button></div>{pauseMutation.isError && <Card className="border-destructive/40"><CardContent className="py-4 text-sm text-destructive">{pauseMutation.error instanceof Error ? pauseMutation.error.message : '账号操作失败，请稍后重试。'}</CardContent></Card>}{accountsQ.isPending ? <AccountTableLoading /> : accountsQ.isError ? <Card><CardHeader><CardTitle>账号数据暂时不可用</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">请检查管理员权限或稍后重试。</p><Button className="mt-4" variant="outline" onClick={() => void accountsQ.refetch()}>重试</Button></CardContent></Card> : accounts.length ? <AdminAccountTable accounts={accounts} pendingAccountId={pauseMutation.isPending ? pauseMutation.variables?.accountId : undefined} onTogglePause={(accountId, paused) => pauseMutation.mutate({ accountId, paused })} /> : <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">暂无抖音账号记录。</CardContent></Card>}</div>
}

function AccountTableLoading() {
  return <Card><CardHeader><Skeleton className="h-5 w-32" /></CardHeader><CardContent className="space-y-3"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></CardContent></Card>
}
