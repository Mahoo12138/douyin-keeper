import { createFileRoute } from '@tanstack/react-router'
import { AdminUserTable } from '@/features/admin/admin-user-table'

export const Route = createFileRoute('/admin/users')({ component: AdminUsers })

function AdminUsers() {
  const users = [{ id: 'u_1', displayName: 'admin', role: 'admin' as const, status: 'active' as const, createdAt: '2026-08-23' }, { id: 'u_2', displayName: 'demo', role: 'user' as const, status: 'active' as const, createdAt: '2026-08-23' }]
  return <div className="space-y-8"><div><p className="text-sm font-medium text-primary">控制台 · 用户</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">用户管理</h1><p className="mt-2 text-sm text-muted-foreground">查看用户角色与账号状态。</p></div><AdminUserTable users={users} /></div>
}
