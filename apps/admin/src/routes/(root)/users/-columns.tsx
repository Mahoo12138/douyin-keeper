import { createColumnHelper } from '@tanstack/react-table'
import { Badge } from '@douyin-keeper/ui-web'

// Reference pattern: per-entity -columns.tsx beside -data-table.tsx and
// index.tsx (modeled on tinyship apps/tanstack-app route groups). Data will
// source from /api/admin/users in M5; sample rows keep the mechanical wiring.
export type AdminUser = {
  id: string
  displayName: string
  role: 'user' | 'admin'
  status: 'active' | 'disabled'
  createdAt: string
}

const col = createColumnHelper<AdminUser>()

export const columns = [
  col.accessor('displayName', { header: '用户名' }),
  col.accessor('role', {
    header: '角色',
    cell: ({ getValue }) => <Badge variant={getValue() === 'admin' ? 'default' : 'secondary'}>{getValue()}</Badge>,
  }),
  col.accessor('status', {
    header: '状态',
    cell: ({ getValue }) => (
      <Badge variant={getValue() === 'active' ? 'success' : 'destructive'}>{getValue()}</Badge>
    ),
  }),
  col.accessor('createdAt', { header: '注册时间' }),
]