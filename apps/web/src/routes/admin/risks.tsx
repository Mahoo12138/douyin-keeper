import { createFileRoute } from '@tanstack/react-router'
import { useInfiniteQuery } from '@tanstack/react-query'
import { listAdminRisks, type components } from '@douyin-keeper/sdk-ts'
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Skeleton } from '@douyin-keeper/ui-web'
import { useState, type FormEvent } from 'react'

import { getToken } from '@/auth/session'
import { AdminRiskTable } from '@/features/admin/admin-risk-table'
import { SelectField } from '@/components/select-field'

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
  const risksQ = useInfiniteQuery({
    queryKey: ['admin-risks', filters],
    queryFn: ({ pageParam }) => listAdminRisks(token as string, { ...filters, limit: 50, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled: !!token,
  })
  const risks = risksQ.data?.pages.flatMap((page) => page.items) ?? []

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

  return <div className="space-y-8"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-primary">控制台 · 风险</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">风险中心</h1><p className="mt-2 text-sm text-muted-foreground">按账号和风险分类查看平台动作阻断、冷却与适配器异常。</p></div><Button variant="outline" onClick={() => void risksQ.refetch()} disabled={risksQ.isFetching}>重新加载</Button></div><Card><CardContent className="p-4"><form className="grid gap-3 md:grid-cols-[1fr_1fr_1.5fr_auto_auto]" onSubmit={submitFilters}><SelectField id="admin-risk-category" ariaLabel="风险分类" value={draftCategory} onChange={setDraftCategory} options={[{ value: '', label: '全部分类' }, { value: 'AUTH', label: '身份认证' }, { value: 'PLATFORM', label: '平台' }, { value: 'PROTOCOL', label: '协议' }, { value: 'BROWSER', label: '浏览器' }, { value: 'NETWORK', label: '网络' }, { value: 'DATA', label: '数据' }]} /><SelectField id="admin-risk-severity" ariaLabel="严重度" value={draftSeverity} onChange={setDraftSeverity} options={[{ value: '', label: '全部严重度' }, { value: 'info', label: '提示' }, { value: 'warning', label: '警告' }, { value: 'critical', label: '严重' }]} /><Input aria-label="错误码" placeholder="搜索错误码，例如 SESSION_EXPIRED" value={draftCode} onChange={(event) => setDraftCode(event.target.value)} /><Button type="submit">筛选</Button><Button type="button" variant="ghost" onClick={resetFilters}>重置</Button></form></CardContent></Card>{risksQ.isPending ? <RiskLoading /> : risksQ.isError ? <Card><CardHeader><CardTitle>风险数据暂时不可用</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">请检查管理员权限、数据库或稍后重试。</p><Button className="mt-4" variant="outline" onClick={() => void risksQ.refetch()}>重试</Button></CardContent></Card> : risks.length ? <><p className="-mb-4 text-sm text-muted-foreground">共显示 {risks.length} 条风险事件，详情不包含 Session、Cookie 或消息正文。</p><AdminRiskTable risks={risks} />{risksQ.hasNextPage && <div className="flex justify-center"><Button variant="outline" onClick={() => void risksQ.fetchNextPage()} disabled={risksQ.isFetchingNextPage}>{risksQ.isFetchingNextPage ? '加载中…' : '加载更多风险'}</Button></div>}</> : <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">暂无匹配的风险事件。</CardContent></Card>}</div>
}

function RiskLoading() {
  return <Card><CardHeader><Skeleton className="h-5 w-32" /></CardHeader><CardContent className="space-y-3"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></CardContent></Card>
}
