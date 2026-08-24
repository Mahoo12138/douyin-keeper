import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { listAdminAuditLogs } from '@douyin-keeper/sdk-ts'
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Skeleton } from '@douyin-keeper/ui-web'
import { useState, type FormEvent } from 'react'

import { getToken } from '@/auth/session'
import { AdminAuditTable } from '@/features/admin/admin-audit-table'

type AuditFilters = { action?: string; resource_type?: string; actor?: string }

export const Route = createFileRoute('/admin/audit')({ component: AdminAuditLogs })

function AdminAuditLogs() {
  const token = getToken()
  const [draftAction, setDraftAction] = useState('')
  const [draftResourceType, setDraftResourceType] = useState('')
  const [draftActor, setDraftActor] = useState('')
  const [filters, setFilters] = useState<AuditFilters>({})
  const auditQ = useQuery({
    queryKey: ['admin-audit-logs', filters],
    queryFn: () => listAdminAuditLogs(token as string, { ...filters, limit: 100 }),
    enabled: !!token,
  })
  const logs = auditQ.data?.items ?? []

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFilters({
      action: draftAction.trim() || undefined,
      resource_type: draftResourceType.trim() || undefined,
      actor: draftActor.trim() || undefined,
    })
  }

  function resetFilters() {
    setDraftAction('')
    setDraftResourceType('')
    setDraftActor('')
    setFilters({})
  }

  return <div className="space-y-8"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-primary">控制台 · 合规</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">审计日志</h1><p className="mt-2 text-sm text-muted-foreground">检索管理员与系统动作，详情内容只显示脱敏状态。</p></div><Button variant="outline" onClick={() => void auditQ.refetch()} disabled={auditQ.isFetching}>重新加载</Button></div><Card><CardContent className="p-4"><form className="grid gap-3 md:grid-cols-[1.2fr_1fr_1.2fr_auto_auto]" onSubmit={submitFilters}><Input aria-label="动作" placeholder="动作，例如 adapter.disable" value={draftAction} onChange={(event) => setDraftAction(event.target.value)} /><Input aria-label="资源类型" placeholder="资源类型，例如 adapter" value={draftResourceType} onChange={(event) => setDraftResourceType(event.target.value)} /><Input aria-label="操作者" placeholder="搜索操作者" value={draftActor} onChange={(event) => setDraftActor(event.target.value)} /><Button type="submit">筛选</Button><Button type="button" variant="ghost" onClick={resetFilters}>重置</Button></form></CardContent></Card>{auditQ.isPending ? <AuditLoading /> : auditQ.isError ? <Card><CardHeader><CardTitle>审计数据暂时不可用</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">请检查管理员权限、数据库或稍后重试。</p><Button className="mt-4" variant="outline" onClick={() => void auditQ.refetch()}>重试</Button></CardContent></Card> : logs.length ? <><p className="-mb-4 text-sm text-muted-foreground">共显示 {logs.length} 条记录，原始详情 JSON 不对管理员页面开放。</p><AdminAuditTable logs={logs} /></> : <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">暂无匹配的审计记录。</CardContent></Card>}</div>
}

function AuditLoading() {
  return <Card><CardHeader><Skeleton className="h-5 w-32" /></CardHeader><CardContent className="space-y-3"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></CardContent></Card>
}
