import { createFileRoute } from '@tanstack/react-router'

import { columns, type AdminUser } from './-columns'
import { DataTable } from './-data-table'

const sampleUsers: AdminUser[] = [
  { id: 'u_1', displayName: 'admin', role: 'admin', status: 'active', createdAt: '2026-08-23' },
  { id: 'u_2', displayName: 'demo', role: 'user', status: 'active', createdAt: '2026-08-23' },
]

export const Route = createFileRoute('/(root)/users/')({
  component: () => (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">用户管理</h1>
        <p className="text-sm text-muted-foreground">M5 里程碑接入 Admin API；当前展示示例数据以固化数据表模式。</p>
      </div>
      <DataTable columns={columns} data={sampleUsers} />
    </div>
  ),
})