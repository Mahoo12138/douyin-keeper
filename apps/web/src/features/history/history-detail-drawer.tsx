import { useQuery } from '@tanstack/react-query'
import { Check, Circle, Clock3, X } from 'lucide-react'
import { getSendJob, type components } from '@douyin-keeper/sdk-ts'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@douyin-keeper/ui-web'

type HistoryItem = components['schemas']['SendIntent']

export function HistoryDetailDrawer({ intent, token, onClose }: { intent: HistoryItem; token: string; onClose: () => void }) {
  const jobQ = useQuery({
    queryKey: ['send-job', intent.latest_job?.id],
    queryFn: () => getSendJob(token, intent.latest_job!.id),
    enabled: !!intent.latest_job?.id,
  })
  const status = statusMeta[intent.status]
  const job = jobQ.data
  const selectedAdapter = job?.selected_adapter ?? intent.latest_job?.adapter
  const timeline = [
    { label: '已排程', time: intent.scheduled_at, detail: intent.intent_type === 'manual' ? '手动执行请求' : '每日任务调度', done: true },
    { label: '开始执行', time: job?.started_at, detail: 'Worker 已领取发送任务', done: !!job?.started_at },
    { label: '选择通道', time: job?.started_at, detail: selectedAdapter || '等待 Adapter 分配', done: !!selectedAdapter },
    { label: intent.status === 'succeeded' ? '发送成功' : intent.status === 'failed' ? '发送失败' : '执行结果', time: job?.finished_at, detail: intent.error_code || status.label, done: !!job?.finished_at || intent.status === 'succeeded' || intent.status === 'failed' },
  ]

  return <div className="fixed inset-0 z-50 flex justify-end" role="presentation"><button className="absolute inset-0 cursor-default bg-black/30" aria-label="关闭发送记录详情" onClick={onClose} /><aside role="dialog" aria-modal="true" aria-labelledby="history-detail-title" className="relative flex h-full w-full max-w-xl flex-col bg-background shadow-2xl"><div className="flex items-start justify-between border-b p-6"><div><p className="text-sm text-muted-foreground">{intent.account.nickname || '未命名账号'} · {intent.friend.display_name}</p><h2 id="history-detail-title" className="mt-1 text-lg font-semibold">发送记录详情</h2></div><Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭发送记录详情"><X /></Button></div><div className="flex-1 space-y-6 overflow-y-auto p-6"><div className="flex items-center justify-between rounded-lg border bg-muted/20 p-4"><div><div className="text-sm text-muted-foreground">执行状态</div><div className="mt-1 text-lg font-semibold">{status.label}</div></div><Badge variant={status.variant}>{intent.intent_type === 'manual' ? '手动执行' : '定时执行'}</Badge></div><div className="grid gap-3 sm:grid-cols-2"><Info label="任务" value={intent.task_id ? `任务 ${intent.task_id.slice(0, 8)}` : '临时发送'} /><Info label="通道" value={selectedAdapter || '待分配'} /><Info label="尝试次数" value={String(job?.attempt ?? intent.latest_job?.attempt ?? 0)} /><Info label="错误码" value={intent.error_code || job?.error_code || '无'} /></div><Card><CardHeader><CardTitle className="text-base">执行时间线</CardTitle></CardHeader><CardContent><ol className="space-y-5">{timeline.map((event) => <li key={event.label} className="relative flex gap-3"><div className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${event.done ? 'bg-primary text-primary-foreground' : 'border text-muted-foreground'}`}>{event.done ? <Check className="size-3" /> : <Circle className="size-2.5" />}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className={`text-sm font-medium ${event.done ? '' : 'text-muted-foreground'}`}>{event.label}</span>{event.time && <span className="text-xs text-muted-foreground">{formatDateTime(event.time)}</span>}</div><p className="mt-1 text-xs text-muted-foreground">{event.detail}</p></div></li>)}</ol></CardContent></Card>{jobQ.isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="size-4 animate-pulse" />正在加载执行诊断…</div>}{jobQ.isError && <p className="text-sm text-destructive">执行诊断暂时不可用，但列表状态仍然有效。</p>}<p className="text-xs leading-5 text-muted-foreground">平台消息 ID 等敏感诊断字段不会在用户界面展示。</p></div></aside></div>
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 truncate text-sm font-medium" title={value}>{value}</div></div>
}

const statusMeta: Record<HistoryItem['status'], { label: string; variant: 'success' | 'warning' | 'destructive' | 'muted' | 'secondary' }> = {
  pending: { label: '待处理', variant: 'secondary' }, queued: { label: '排队中', variant: 'warning' }, running: { label: '执行中', variant: 'warning' }, retry_wait: { label: '等待重试', variant: 'warning' }, succeeded: { label: '已成功', variant: 'success' }, failed: { label: '失败', variant: 'destructive' }, skipped: { label: '已跳过', variant: 'muted' }, cancelled: { label: '已取消', variant: 'muted' },
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
