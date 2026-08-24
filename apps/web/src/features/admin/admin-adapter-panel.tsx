import type { components } from '@douyin-keeper/sdk-ts'
import { Activity, Ban, CheckCircle2, CircleAlert, Code2, Power } from 'lucide-react'
import { Badge, Card, CardContent, CardHeader, CardTitle, Switch } from '@douyin-keeper/ui-web'

type Adapter = components['schemas']['AdminAdapter']

type Props = {
  adapters: Adapter[]
  pendingAdapter?: string
  onToggle: (adapter: Adapter) => void
}

export function AdminAdapterPanel({ adapters, pendingAdapter, onToggle }: Props) {
  return <div className="grid gap-4 lg:grid-cols-3">{adapters.map((adapter) => <AdapterCard key={adapter.name} adapter={adapter} pending={pendingAdapter === adapter.name} onToggle={() => onToggle(adapter)} />)}</div>
}

function AdapterCard({ adapter, pending, onToggle }: { adapter: Adapter; pending: boolean; onToggle: () => void }) {
  const StatusIcon = adapter.status === 'healthy' ? CheckCircle2 : adapter.status === 'disabled' ? Ban : adapter.status === 'unknown' ? Activity : CircleAlert

  return <Card className="flex flex-col"><CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0"><div className="flex min-w-0 items-start gap-3"><div className="rounded-lg bg-primary/10 p-2 text-primary"><Code2 className="size-4" /></div><div className="min-w-0"><CardTitle className="truncate text-base">{adapter.name}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{adapter.executable ? '当前已接入可执行 Worker' : '实验/未接线能力'}</p></div></div><Badge variant={statusVariant(adapter.status)}><StatusIcon className="mr-1 size-3" />{statusLabel(adapter.status)}</Badge></CardHeader><CardContent className="flex flex-1 flex-col"><div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3 text-sm"><div><p className="text-xs text-muted-foreground">版本</p><p className="mt-1 font-medium">{adapter.version ?? '未上报'}</p></div><div><p className="text-xs text-muted-foreground">失败次数</p><p className="mt-1 font-medium">{adapter.failure_count}</p></div><div><p className="text-xs text-muted-foreground">最近错误</p><p className="mt-1 truncate font-medium" title={adapter.error_code ?? undefined}>{adapter.error_code ?? '暂无'}</p></div><div><p className="text-xs text-muted-foreground">最近检查</p><p className="mt-1 font-medium">{formatDate(adapter.checked_at)}</p></div></div><div className="mt-5 flex items-center justify-between border-t pt-4"><div className="flex items-center gap-2"><Power className="size-4 text-muted-foreground" /><div><p className="text-sm font-medium">允许业务路由</p><p className="text-xs text-muted-foreground">关闭后 Resolver 不再选择该 Adapter</p></div></div><Switch checked={adapter.enabled} disabled={pending} aria-label={`${adapter.name} ${adapter.enabled ? '关闭' : '启用'}`} onCheckedChange={onToggle} /></div>{adapter.circuit_open_until && <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">熔断至 {formatDate(adapter.circuit_open_until)}</p>}</CardContent></Card>
}

function statusLabel(status: Adapter['status']) {
  return { healthy: '健康', degraded: '降级', down: '熔断', disabled: '已关闭', unknown: '未上报' }[status]
}

function statusVariant(status: Adapter['status']) {
  return { healthy: 'success', degraded: 'warning', down: 'destructive', disabled: 'muted', unknown: 'muted' }[status] as 'success' | 'warning' | 'destructive' | 'muted'
}

function formatDate(value: string | null | undefined) {
  if (!value) return '暂无'
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
