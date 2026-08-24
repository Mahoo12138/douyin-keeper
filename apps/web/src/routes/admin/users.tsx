import { Outlet, createFileRoute, useLocation } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { listAdminUsers } from '@douyin-keeper/sdk-ts'
import { Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@douyin-keeper/ui-web'

import { getToken } from '@/auth/session'
import { AdminUserTable } from '@/features/admin/admin-user-table'

export const Route = createFileRoute('/admin/users')({ component: AdminUsers })

function AdminUsers() {
  const location = useLocation()
  return location.pathname === '/admin/users' ? <AdminUsersList /> : <Outlet />
}

function AdminUsersList() {
  const token = getToken()
  const usersQ = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => listAdminUsers(token as string, { limit: 100 }),
    enabled: !!token,
  })
  const users = usersQ.data?.items ?? []

  return <div className="space-y-8"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-primary">控制台 · 用户</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">用户管理</h1><p className="mt-2 text-sm text-muted-foreground">查看用户角色、资源使用量、最近登录和权益到期时间。</p></div><Button variant="outline" onClick={() => void usersQ.refetch()} disabled={usersQ.isFetching}>重新加载</Button></div>{usersQ.isPending ? <UserTableLoading /> : usersQ.isError ? <Card><CardHeader><CardTitle>用户数据暂时不可用</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">请检查管理员权限或稍后重试。</p><Button className="mt-4" variant="outline" onClick={() => void usersQ.refetch()}>重试</Button></CardContent></Card> : users.length ? <AdminUserTable users={users} /> : <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">暂无用户记录。</CardContent></Card>}</div>
}

function UserTableLoading() {
  return <Card><CardHeader><Skeleton className="h-5 w-28" /></CardHeader><CardContent className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></CardContent></Card>
}
