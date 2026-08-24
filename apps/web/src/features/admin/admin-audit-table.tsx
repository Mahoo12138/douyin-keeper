import type { components } from '@douyin-keeper/sdk-ts'
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@douyin-keeper/ui-web'

type AuditLog = components['schemas']['AdminAuditLog']

export function AdminAuditTable({ logs }: { logs: AuditLog[] }) {
  return <div className="overflow-x-auto rounded-lg border bg-card"><Table><TableHeader><TableRow><TableHead className="pl-5">操作者 / 动作</TableHead><TableHead>资源</TableHead><TableHead>详情</TableHead><TableHead className="pr-5">时间</TableHead></TableRow></TableHeader><TableBody>{logs.map((log) => <AuditRow key={log.id} log={log} />)}</TableBody></Table></div>
}

function AuditRow({ log }: { log: AuditLog }) {
  return <TableRow><TableCell className="min-w-56 pl-5"><div className="font-medium">{log.action}</div><div className="mt-1 text-xs text-muted-foreground">{log.actor_display_name ?? '系统'}</div></TableCell><TableCell className="min-w-48"><div className="text-sm">{log.resource_type}</div><div className="mt-1 max-w-56 truncate text-xs text-muted-foreground" title={log.resource_id ?? undefined}>{log.resource_id ?? '未指定资源'}</div></TableCell><TableCell className="min-w-32">{log.has_detail ? <Badge variant="muted">已脱敏</Badge> : <span className="text-sm text-muted-foreground">无附加详情</span>}</TableCell><TableCell className="min-w-44 pr-5 text-sm text-muted-foreground">{formatDate(log.created_at)}</TableCell></TableRow>
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
