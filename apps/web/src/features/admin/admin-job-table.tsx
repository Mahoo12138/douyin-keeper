import type { components } from '@douyin-keeper/sdk-ts'
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@douyin-keeper/ui-web'
import { adminJobTypeLabel } from './admin-job-utils'

type Job = components['schemas']['AdminJob']

export function AdminJobTable({ jobs }: { jobs: Job[] }) {
  return <div className="overflow-x-auto rounded-lg border bg-card"><Table><TableHeader><TableRow><TableHead className="pl-5">类型 / ID</TableHead><TableHead>状态</TableHead><TableHead>关联资源</TableHead><TableHead>Worker / Lease</TableHead><TableHead className="pr-5">创建时间</TableHead></TableRow></TableHeader><TableBody>{jobs.map((job) => <JobRow key={job.id} job={job} />)}</TableBody></Table></div>
}

function JobRow({ job }: { job: Job }) {
  return <TableRow><TableCell className="min-w-56 pl-5"><div className="font-medium">{adminJobTypeLabel(job.type)}</div><div className="mt-1 font-mono text-[11px] text-muted-foreground" title={job.type}>{job.type}</div><div className="mt-1 font-mono text-[11px] text-muted-foreground" title={job.id}>{job.id.slice(0, 8)}</div>{job.error_code && <div className="mt-1 text-xs text-destructive">{job.error_code}</div>}</TableCell><TableCell className="min-w-28"><Badge variant={statusVariant(job.status)}>{statusLabel(job.status)}</Badge>{job.cancelable && <div className="mt-2 text-xs text-muted-foreground">可取消</div>}</TableCell><TableCell className="min-w-40 text-xs text-muted-foreground"><div>用户：{shortID(job.user_id)}</div><div className="mt-1">账号：{shortID(job.account_id)}</div></TableCell><TableCell className="min-w-44 text-xs text-muted-foreground"><div>{job.worker_id || '未领取'}</div><div className="mt-1">{job.lease_expires_at ? `租约至 ${formatDate(job.lease_expires_at)}` : '无活动租约'}</div></TableCell><TableCell className="min-w-40 pr-5 text-sm text-muted-foreground">{formatDate(job.created_at)}</TableCell></TableRow>
}

function shortID(value: string | null | undefined) {
  return value ? value.slice(0, 8) : '—'
}

function statusLabel(status: Job['status']) {
  return { queued: '排队中', running: '运行中', waiting_user: '等待用户', succeeded: '成功', failed: '失败', cancelled: '已取消' }[status]
}

function statusVariant(status: Job['status']) {
  return { queued: 'muted', running: 'warning', waiting_user: 'warning', succeeded: 'success', failed: 'destructive', cancelled: 'muted' }[status] as 'muted' | 'warning' | 'success' | 'destructive'
}

function formatDate(value: string | null | undefined) {
  if (!value) return '暂无'
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
