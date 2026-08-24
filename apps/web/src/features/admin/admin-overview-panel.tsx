import type { components } from '@douyin-keeper/sdk-ts'
import { Activity, AlertTriangle, Clock3, Server, Send, Users } from 'lucide-react'
import { Badge, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@douyin-keeper/ui-web'

type Overview = components['schemas']['AdminOverview']

export function AdminOverviewPanel({ overview }: { overview: Overview }) {
  return <div className="space-y-6"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><MetricCard icon={Users} label="日活用户" value={overview.dau} note={`活跃用户 ${overview.active_users}`} /><MetricCard icon={Activity} label="有效账号" value={overview.active_accounts} note="已绑定且 Session 有效" /><MetricCard icon={Send} label="今日发送成功率" value={formatRate(overview.today_send_success_rate)} note={`成功 ${overview.today_send_succeeded} · 失败 ${overview.today_send_failed}`} /><MetricCard icon={AlertTriangle} label="风险账号" value={overview.risk_accounts} note="需要运营关注" tone={overview.risk_accounts > 0 ? 'warning' : 'default'} /><MetricCard icon={Clock3} label="队列延迟" value={formatSeconds(overview.queue_latency_seconds)} note={`积压 ${overview.queue_pending} · 重试 ${overview.queue_retry}`} tone={overview.queue_pending > 0 ? 'warning' : 'default'} /><MetricCard icon={Server} label="Worker 在线" value={`${overview.workers_online} / ${overview.workers_total}`} note={`运行中 ${overview.queue_active} 个队列任务`} tone={overview.workers_online < overview.workers_total ? 'warning' : 'default'} /></div><div className="grid gap-6 lg:grid-cols-2"><AdapterRateCard items={overview.adapter_success_rates} /><FailureCodeCard items={overview.failure_codes} /></div><Card><CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0"><div><CardTitle className="text-base">队列与观测</CardTitle><p className="mt-1 text-sm text-muted-foreground">统一概览使用 Asia/Shanghai 自然日统计，运行时数据来自 Worker 与队列观测。</p></div><span className="whitespace-nowrap text-xs text-muted-foreground">观测于 {formatDate(overview.observed_at)}</span></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-3"><QueueStat label="Pending" value={overview.queue_pending} /><QueueStat label="Active" value={overview.queue_active} /><QueueStat label="Retry" value={overview.queue_retry} /></div></CardContent></Card></div>
}

function MetricCard({ icon: Icon, label, value, note, tone = 'default' }: { icon: typeof Activity; label: string; value: string | number; note: string; tone?: 'default' | 'warning' }) {
  return <Card><CardContent className="flex items-start justify-between gap-4 p-5"><div><p className="text-sm text-muted-foreground">{label}</p><p className={`mt-2 text-2xl font-semibold tracking-tight ${tone === 'warning' ? 'text-amber-700 dark:text-amber-400' : ''}`}>{value}</p><p className="mt-1 text-xs text-muted-foreground">{note}</p></div><div className={`rounded-lg p-2 ${tone === 'warning' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'bg-primary/10 text-primary'}`}><Icon className="size-4" /></div></CardContent></Card>
}

function AdapterRateCard({ items }: { items: Overview['adapter_success_rates'] }) {
  return <Card><CardHeader><CardTitle className="text-base">通道成功率</CardTitle><p className="mt-1 text-sm text-muted-foreground">按今日已完成发送任务统计。</p></CardHeader><CardContent>{items.length ? <div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead className="pl-4">通道</TableHead><TableHead>成功 / 失败</TableHead><TableHead className="pr-4 text-right">成功率</TableHead></TableRow></TableHeader><TableBody>{items.map((item) => <TableRow key={item.name}><TableCell className="pl-4 font-medium">{adapterLabel(item.name)}</TableCell><TableCell className="text-sm"><span className="text-emerald-700 dark:text-emerald-400">{item.succeeded}</span><span className="mx-1 text-muted-foreground">/</span><span className="text-destructive">{item.failed}</span></TableCell><TableCell className="pr-4 text-right"><Badge variant={item.success_rate >= 0.95 ? 'success' : item.success_rate >= 0.8 ? 'warning' : 'destructive'}>{formatRate(item.success_rate)}</Badge></TableCell></TableRow>)}</TableBody></Table></div> : <EmptyState text="今日暂无通道发送数据。" />}</CardContent></Card>
}

function FailureCodeCard({ items }: { items: Overview['failure_codes'] }) {
  return <Card><CardHeader><CardTitle className="text-base">失败码 Top 5</CardTitle><p className="mt-1 text-sm text-muted-foreground">今日发送失败任务按错误码聚合。</p></CardHeader><CardContent>{items.length ? <div className="space-y-3">{items.map((item, index) => <div key={item.code} className="flex items-center gap-3"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">{index + 1}</span><span className="min-w-0 flex-1 truncate font-mono text-sm" title={item.code}>{item.code}</span><span className="text-sm font-medium">{item.count}</span></div>)}</div> : <EmptyState text="今日暂无发送失败。" />}</CardContent></Card>
}

function QueueStat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg bg-muted/40 p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{text}</div>
}

function adapterLabel(name: string) {
  return name === 'browser' ? 'Browser' : name === 'protocol' ? 'Protocol' : name
}

function formatRate(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function formatSeconds(value: number) {
  return value > 60 ? `${Math.floor(value / 60)}m ${value % 60}s` : `${value}s`
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
