import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { getAdminRuntime } from '@douyin-keeper/sdk-ts'
import { Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@douyin-keeper/ui-web'

import { getToken } from '@/auth/session'
import { AdminRuntimePanel } from '@/features/admin/admin-runtime-panel'

export const Route = createFileRoute('/admin/workers')({ component: AdminWorkers })

function AdminWorkers() {
  const token = getToken()
  const runtimeQ = useQuery({
    queryKey: ['admin-runtime'],
    queryFn: () => getAdminRuntime(token as string),
    enabled: !!token,
  })

  return <div className="space-y-8"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-primary">控制台 · 运行时</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Worker / 队列</h1><p className="mt-2 text-sm text-muted-foreground">查看 Worker pool、Scheduler、队列延迟和 Job 运行概况。</p></div><Button variant="outline" onClick={() => void runtimeQ.refetch()} disabled={runtimeQ.isFetching}>重新加载</Button></div>{runtimeQ.isPending ? <RuntimeLoading /> : runtimeQ.isError ? <Card><CardHeader><CardTitle>运行时数据暂时不可用</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">请检查管理员权限、Redis 或稍后重试。</p><Button className="mt-4" variant="outline" onClick={() => void runtimeQ.refetch()}>重试</Button></CardContent></Card> : runtimeQ.data ? <AdminRuntimePanel runtime={runtimeQ.data} /> : <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">暂无运行时数据。</CardContent></Card>}</div>
}

function RuntimeLoading() {
  return <div className="space-y-6"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Card key={index}><CardContent className="p-5"><Skeleton className="h-20 w-full" /></CardContent></Card>)}</div><Card><CardHeader><Skeleton className="h-5 w-32" /></CardHeader><CardContent><Skeleton className="h-24 w-full" /></CardContent></Card></div>
}
