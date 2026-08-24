import type { components } from '@douyin-keeper/sdk-ts'
import { Link } from '@tanstack/react-router'
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@douyin-keeper/ui-web'

type AdminUser = components['schemas']['AdminUser']

export function AdminUserTable({ users }: { users: AdminUser[] }) {
  return <div className="overflow-x-auto rounded-lg border bg-card"><Table><TableHeader><TableRow><TableHead className="pl-5">用户</TableHead><TableHead>角色 / 状态</TableHead><TableHead>账号 / 任务</TableHead><TableHead>权益到期</TableHead><TableHead>最近登录</TableHead><TableHead className="pr-5 text-right">操作</TableHead></TableRow></TableHeader><TableBody>{users.map((user) => <TableRow key={user.id}><TableCell className="min-w-44 pl-5"><div className="font-medium">{user.display_name || '未命名用户'}</div><div className="mt-1 text-xs text-muted-foreground">{user.id.slice(0, 8)}</div></TableCell><TableCell className="min-w-32"><div className="flex flex-wrap gap-2"><Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>{user.role === 'admin' ? '管理员' : '用户'}</Badge><Badge variant={user.status === 'active' ? 'success' : 'muted'}>{user.status === 'active' ? '正常' : '停用'}</Badge></div></TableCell><TableCell className="min-w-32 text-sm">{user.account_count} / {user.task_count}<div className="mt-1 text-xs text-muted-foreground">账号 / 任务</div></TableCell><TableCell className="min-w-32 text-sm text-muted-foreground">{formatDate(user.entitlement_expires_at)}</TableCell><TableCell className="min-w-32 text-sm text-muted-foreground">{formatDate(user.last_login_at)}</TableCell><TableCell className="min-w-24 pr-5 text-right"><Link to="/admin/users/$userId" params={{ userId: user.id }} className="text-sm font-medium text-primary hover:underline">授权管理</Link></TableCell></TableRow>)}</TableBody></Table></div>
}

function formatDate(value: string | null | undefined) {
  if (!value) return '暂无'
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(value))
}
