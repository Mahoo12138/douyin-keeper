import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { listAdminRisks, type components } from '@douyin-keeper/sdk-ts'
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Skeleton } from '@douyin-keeper/ui-web'
import { useState, type FormEvent } from 'react'

import { getToken } from '@/auth/session'
import { AdminRiskTable } from '@/features/admin/admin-risk-table'

type RiskCategory = components['schemas']['AdminRisk']['category']
type RiskSeverity = components['schemas']['AdminRisk']['severity']
type RiskFilters = { category?: RiskCategory; severity?: RiskSeverity; code?: string }

export const Route = createFileRoute('/admin/risks')({ component: AdminRisks })

function AdminRisks() {
  const token = getToken()
  const [draftCategory, setDraftCategory] = useState('')
  const [draftSeverity, setDraftSeverity] = useState('')
  const [draftCode, setDraftCode] = useState('')
  const [filters, setFilters] = useState<RiskFilters>({})
  const risksQ = useQuery({
    queryKey: ['admin-risks', filters],
    queryFn: () => listAdminRisks(token as string, { ...filters, limit: 100 }),
    enabled: !!token,
  })
  const risks = risksQ.data?.items ?? []

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFilters({
      category: draftCategory ? draftCategory as RiskCategory : undefined,
      severity: draftSeverity ? draftSeverity as RiskSeverity : undefined,
      code: draftCode.trim() || undefined,
    })
  }

  function resetFilters() {
    setDraftCategory('')
    setDraftSeverity('')
    setDraftCode('')
    setFilters({})
  }

  return <div className="space-y-8"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-primary">控制台 · 风险</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">风险中心</h1><p className="mt-2 text-sm text-muted-foreground">按账号和风险分类查看平台动作阻断、冷却与适配器异常。</p></div><Button variant="outline" onClick={() => void risksQ.refetch()} disabled={risksQ.isFetching}>重新加载</Button></div><Card><CardContent className="p-4"><form className="grid gap-3 md:grid-cols-[1fr_1fr_1.5fr_auto_auto]" onSubmit={submitFilters}><select aria-label="风险分类" className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" value={draftCategory} onChange={(event) => setDraftCategory(event.target.value)}><option value="">全部分类</option><option value="AUTH">身份认证</option><option value="PLATFORM">平台</option><option value="PROTOCOL">协议</option><option value="BROWSER">浏览器</option><option value="NETWORK">网络</option><option value="DATA">数据</option></select><select aria-label="严重度" className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" value={draftSeverity} onChange={(event) => setDraftSeverity(event.target.value)}><option value="">全部严重度</option><option value="info">提示</option><option value="warning">警告</option><option value="critical">严重</option></select><Input aria-label="错误码" placeholder="搜索错误码，例如 SESSION_EXPIRED" value={draftCode} onChange={(event) => setDraftCode(event.target.value)} /><Button type="submit">筛选</Button><Button type="button" variant="ghost" onClick={resetFilters}>重置</Button></form></CardContent></Card>{risksQ.isPending ? <RiskLoading /> : risksQ.isError ? <Card><CardHeader><CardTitle>风险数据暂时不可用</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">请检查管理员权限、数据库或稍后重试。</p><Button className="mt-4" variant="outline" onClick={() => void risksQ.refetch()}>重试</Button></CardContent></Card> : risks.length ? <><p className="-mb-4 text-sm text-muted-foreground">共显示 {risks.length} 条风险事件，详情不包含 Session、Cookie 或消息正文。</p><AdminRiskTable risks={risks} /></> : <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">暂无匹配的风险事件。</CardContent></Card>}</div>
}

function RiskLoading() {
  return <Card><CardHeader><Skeleton className="h-5 w-32" /></CardHeader><CardContent className="space-y-3"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></CardContent></Card>
}
