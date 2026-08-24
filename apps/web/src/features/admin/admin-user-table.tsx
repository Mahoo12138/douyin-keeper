import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@douyin-keeper/ui-web'

type AdminUser = { id: string; displayName: string; role: 'user' | 'admin'; status: 'active' | 'disabled'; createdAt: string }

export function AdminUserTable({ users }: { users: AdminUser[] }) {
  return <div className="overflow-hidden rounded-lg border bg-card"><Table><TableHeader><TableRow><TableHead className="pl-5">用户名</TableHead><TableHead>角色</TableHead><TableHead>状态</TableHead><TableHead>注册时间</TableHead><TableHead className="pr-5 text-right">操作</TableHead></TableRow></TableHeader><TableBody>{users.map((user) => <TableRow key={user.id}><TableCell className="pl-5 font-medium">{user.displayName}</TableCell><TableCell><Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>{user.role}</Badge></TableCell><TableCell><Badge variant={user.status === 'active' ? 'success' : 'muted'}>{user.status === 'active' ? '正常' : '停用'}</Badge></TableCell><TableCell className="text-sm text-muted-foreground">{user.createdAt}</TableCell><TableCell className="pr-5 text-right text-sm text-muted-foreground">待接入 API</TableCell></TableRow>)}</TableBody></Table></div>
}
