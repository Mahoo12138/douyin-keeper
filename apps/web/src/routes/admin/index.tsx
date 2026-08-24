import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { getAdminOverview } from '@douyin-keeper/sdk-ts'
import { Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@douyin-keeper/ui-web'

import { getToken } from '@/auth/session'
import { AdminOverviewPanel } from '@/features/admin/admin-overview-panel'

export const Route = createFileRoute('/admin/')({ component: AdminOverview })

function AdminOverview() {
  const token = getToken()
  const overviewQ = useQuery({ queryKey: ['admin-overview'], queryFn: () => getAdminOverview(token as string), enabled: !!token })

  return <div className="space-y-8"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-primary">运营中心</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">运营概览</h1><p className="mt-2 text-sm text-muted-foreground">统一查看用户活跃、发送质量、队列和风险状态。</p></div><Button variant="outline" onClick={() => void overviewQ.refetch()} disabled={overviewQ.isFetching}>重新加载</Button></div>{overviewQ.isPending ? <OverviewLoading /> : overviewQ.isError ? <Card><CardHeader><CardTitle>概览数据暂时不可用</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">请检查管理员权限或稍后重试。</p><Button className="mt-4" variant="outline" onClick={() => void overviewQ.refetch()}>重试</Button></CardContent></Card> : overviewQ.data ? <AdminOverviewPanel overview={overviewQ.data} /> : <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">暂无概览数据。</CardContent></Card>}</div>
}

function OverviewLoading() {
  return <div className="space-y-6"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <Card key={index}><CardContent className="p-5"><Skeleton className="h-20 w-full" /></CardContent></Card>)}</div><div className="grid gap-6 lg:grid-cols-2"><Card><CardHeader><Skeleton className="h-5 w-32" /></CardHeader><CardContent><Skeleton className="h-36 w-full" /></CardContent></Card><Card><CardHeader><Skeleton className="h-5 w-32" /></CardHeader><CardContent><Skeleton className="h-36 w-full" /></CardContent></Card></div></div>
}
