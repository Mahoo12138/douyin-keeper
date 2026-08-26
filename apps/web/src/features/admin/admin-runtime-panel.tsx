import type { components } from '@douyin-keeper/sdk-ts'
import { Activity, AlertTriangle, Clock3, Gauge, Server } from 'lucide-react'
import { Badge, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@douyin-keeper/ui-web'

type Runtime = components['schemas']['AdminRuntime']
type Pool = components['schemas']['AdminWorkerPool']
type Queue = components['schemas']['AdminQueue']

export function AdminRuntimePanel({ runtime }: { runtime: Runtime }) {
  return <div className="space-y-6"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><MetricCard icon={Activity} label="运行中 Job" value={runtime.running_jobs} note="generic + send" /><MetricCard icon={Gauge} label="失败 Job" value={runtime.failed_jobs_24h} note="最近 24 小时" /><MetricCard icon={Server} label="Browser slot" value={`${runtime.browser_slots_used} / ${runtime.browser_slots_limit}`} note="全局并发" /><MetricCard icon={Clock3} label="Scheduler" value={runtime.scheduler_online ? '在线' : '离线'} note={runtime.scheduler_leader_expires_at ? `租约至 ${formatDate(runtime.scheduler_leader_expires_at)}` : '未发现 leader lease'} /><MetricCard icon={AlertTriangle} label="Outbox 死信" value={runtime.outbox_dead} note={runtime.outbox_oldest_dead_at ? `最早 ${formatDate(runtime.outbox_oldest_dead_at)}` : '发布链路正常'} /></div><section><div className="mb-3 flex items-center justify-between"><div><h2 className="text-lg font-semibold">Worker pools</h2><p className="text-sm text-muted-foreground">基于 Asynq 服务心跳和活动 Worker 汇总。</p></div><span className="text-xs text-muted-foreground">观测于 {formatDate(runtime.observed_at)}</span></div><div className="grid gap-4 lg:grid-cols-3">{runtime.pools.map((pool) => <PoolCard key={pool.name} pool={pool} />)}</div></section><section><div className="mb-3"><h2 className="text-lg font-semibold">队列状态</h2><p className="text-sm text-muted-foreground">队列是传输层，业务状态仍以 PostgreSQL Job / Intent 为准。</p></div><div className="overflow-x-auto rounded-lg border bg-card"><Table><TableHeader><TableRow><TableHead className="pl-5">队列</TableHead><TableHead>Pending</TableHead><TableHead>Active</TableHead><TableHead>Retry</TableHead><TableHead>延迟</TableHead><TableHead>今日处理</TableHead><TableHead className="pr-5">状态</TableHead></TableRow></TableHeader><TableBody>{runtime.queues.map((queue) => <QueueRow key={queue.name} queue={queue} />)}</TableBody></Table></div></section></div>
}

function MetricCard({ icon: Icon, label, value, note }: { icon: typeof Activity; label: string; value: string | number; note: string }) {
  return <Card><CardContent className="flex items-start justify-between gap-4 p-5"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{note}</p></div><div className="rounded-lg bg-primary/10 p-2 text-primary"><Icon className="size-4" /></div></CardContent></Card>
}

function PoolCard({ pool }: { pool: Pool }) {
  return <Card><CardHeader className="flex flex-row items-center justify-between space-y-0"><CardTitle className="text-base">{pool.name}</CardTitle><Badge variant={pool.online ? 'success' : 'muted'}>{pool.online ? '在线' : '离线'}</Badge></CardHeader><CardContent><div className="flex items-end justify-between"><div><p className="text-2xl font-semibold">{pool.active_workers} <span className="text-sm font-normal text-muted-foreground">/ {pool.concurrency}</span></p><p className="text-xs text-muted-foreground">活动 Worker / 并发</p></div><div className="text-right text-xs text-muted-foreground"><p>版本：{pool.version ?? '未上报'}</p><p className="mt-1">启动：{formatDate(pool.started_at)}</p></div></div></CardContent></Card>
}

function QueueRow({ queue }: { queue: Queue }) {
  return <TableRow><TableCell className="pl-5"><div className="font-medium">{queue.name}</div><div className="mt-1 text-xs text-muted-foreground">{queue.pool}</div></TableCell><TableCell>{queue.pending}</TableCell><TableCell>{queue.active}</TableCell><TableCell>{queue.retry}</TableCell><TableCell>{queue.latency_seconds}s</TableCell><TableCell><div>{queue.processed}</div><div className="mt-1 text-xs text-destructive">失败 {queue.failed}</div></TableCell><TableCell className="pr-5"><Badge variant={queue.paused ? 'warning' : 'success'}>{queue.paused ? '已暂停' : '运行中'}</Badge></TableCell></TableRow>
}

function formatDate(value: string | null | undefined) {
  if (!value) return '未上报'
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
