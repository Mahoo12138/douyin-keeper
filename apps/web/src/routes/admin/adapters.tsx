import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { listAdminAdapters, updateAdminAdapter } from '@douyin-keeper/sdk-ts'
import { Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@douyin-keeper/ui-web'

import { getToken } from '@/auth/session'
import { AdminAdapterPanel } from '@/features/admin/admin-adapter-panel'

export const Route = createFileRoute('/admin/adapters')({ component: AdminAdapters })

function AdminAdapters() {
  const token = getToken()
  const adaptersQ = useQuery({
    queryKey: ['admin-adapters'],
    queryFn: () => listAdminAdapters(token as string),
    enabled: !!token,
  })
  const updateMutation = useMutation({
    mutationFn: ({ adapter, enabled }: { adapter: string; enabled: boolean }) => updateAdminAdapter(token as string, adapter, enabled),
    onSuccess: () => void adaptersQ.refetch(),
  })
  const adapters = adaptersQ.data?.items ?? []

  return <div className="space-y-8"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-primary">控制台 · 能力</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Adapter</h1><p className="mt-2 text-sm text-muted-foreground">查看平台接入健康度，并临时关闭不稳定的业务路由。</p></div><Button variant="outline" onClick={() => void adaptersQ.refetch()} disabled={adaptersQ.isFetching}>重新加载</Button></div>{updateMutation.isError && <Card><CardContent className="py-4 text-sm text-destructive">Adapter 状态更新失败，请检查权限或稍后重试。</CardContent></Card>}{adaptersQ.isPending ? <AdapterLoading /> : adaptersQ.isError ? <Card><CardHeader><CardTitle>Adapter 数据暂时不可用</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">请检查管理员权限、数据库或稍后重试。</p><Button className="mt-4" variant="outline" onClick={() => void adaptersQ.refetch()}>重试</Button></CardContent></Card> : adapters.length ? <AdminAdapterPanel adapters={adapters} pendingAdapter={updateMutation.isPending ? updateMutation.variables?.adapter : undefined} onToggle={(adapter) => updateMutation.mutate({ adapter: adapter.name, enabled: !adapter.enabled })} /> : <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">暂无 Adapter 配置。</CardContent></Card>}</div>
}

function AdapterLoading() {
  return <div className="grid gap-4 lg:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <Card key={index}><CardHeader><Skeleton className="h-6 w-48" /></CardHeader><CardContent><Skeleton className="h-40 w-full" /></CardContent></Card>)}</div>
}
