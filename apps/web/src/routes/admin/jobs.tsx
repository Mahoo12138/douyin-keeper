import { createFileRoute } from '@tanstack/react-router'
import { useInfiniteQuery } from '@tanstack/react-query'
import { listAdminJobs, type components } from '@douyin-keeper/sdk-ts'
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Skeleton } from '@douyin-keeper/ui-web'
import { useState, type FormEvent } from 'react'

import { getToken } from '@/auth/session'
import { AdminJobTable } from '@/features/admin/admin-job-table'
import { adminJobTypeOptions } from '@/features/admin/admin-job-utils'

type JobStatus = components['schemas']['AdminJob']['status']
type JobFilters = { status?: JobStatus; type?: string }

export const Route = createFileRoute('/admin/jobs')({ component: AdminJobs })

function AdminJobs() {
  const token = getToken()
  const [draftStatus, setDraftStatus] = useState('')
  const [draftType, setDraftType] = useState('')
  const [filters, setFilters] = useState<JobFilters>({})
  const jobsQ = useInfiniteQuery({
    queryKey: ['admin-jobs', filters],
    queryFn: ({ pageParam }) => listAdminJobs(token as string, { ...filters, limit: 50, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled: !!token,
  })
  const jobs = jobsQ.data?.pages.flatMap((page) => page.items) ?? []

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFilters({ status: draftStatus ? draftStatus as JobStatus : undefined, type: draftType.trim() || undefined })
  }

  function resetFilters() {
    setDraftStatus('')
    setDraftType('')
    setFilters({})
  }

  return <div className="space-y-8"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-primary">控制台 · 运行时</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Generic Jobs</h1><p className="mt-2 text-sm text-muted-foreground">查看绑定、同步、平台归档和发送 Job 的生命周期；事件 payload 不在管理员列表中开放。</p></div><Button variant="outline" onClick={() => void jobsQ.refetch()} disabled={jobsQ.isFetching}>重新加载</Button></div><Card><CardContent className="p-4"><form className="grid gap-3 md:grid-cols-[1fr_2fr_auto_auto]" onSubmit={submitFilters}><select aria-label="Job 状态" className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" value={draftStatus} onChange={(event) => setDraftStatus(event.target.value)}><option value="">全部状态</option><option value="queued">排队中</option><option value="running">运行中</option><option value="waiting_user">等待用户</option><option value="succeeded">成功</option><option value="failed">失败</option><option value="cancelled">已取消</option></select><div><Input list="admin-job-type-options" aria-label="Job 类型" placeholder="输入或选择 Job 类型" value={draftType} onChange={(event) => setDraftType(event.target.value)} /><datalist id="admin-job-type-options">{adminJobTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</datalist></div><Button type="submit">筛选</Button><Button type="button" variant="ghost" onClick={resetFilters}>重置</Button></form></CardContent></Card>{jobsQ.isPending ? <JobLoading /> : jobsQ.isError ? <Card><CardHeader><CardTitle>Job 数据暂时不可用</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">请检查管理员权限、数据库或稍后重试。</p><Button className="mt-4" variant="outline" onClick={() => void jobsQ.refetch()}>重试</Button></CardContent></Card> : jobs.length ? <><p className="-mb-4 text-sm text-muted-foreground">共显示 {jobs.length} 条 Job 生命周期记录，不包含事件详情或平台敏感数据。</p><AdminJobTable jobs={jobs} />{jobsQ.hasNextPage && <div className="flex justify-center"><Button variant="outline" onClick={() => void jobsQ.fetchNextPage()} disabled={jobsQ.isFetchingNextPage}>{jobsQ.isFetchingNextPage ? '加载中…' : '加载更多 Job'}</Button></div>}</> : <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">暂无匹配的 Generic Job。</CardContent></Card>}</div>
}

function JobLoading() {
  return <Card><CardHeader><Skeleton className="h-5 w-32" /></CardHeader><CardContent className="space-y-3"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></CardContent></Card>
}
