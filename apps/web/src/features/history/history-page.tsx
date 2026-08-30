import { useMemo, useState } from 'react'
import { useInfiniteQuery, useQueries } from '@tanstack/react-query'
import { CalendarDays, ChevronRight, Filter, Search, X } from 'lucide-react'
import { listSendIntents, type components } from '@douyin-keeper/sdk-ts'
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, DatePicker, Input, Label, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@douyin-keeper/ui-web'

import { getToken } from '@/auth/session'
import { HistoryDetailDrawer } from './history-detail-drawer'
import { friendOptionsFromFriends, listAllFriendsForAccount } from './history-utils'
import { useAccountsQuery } from '../accounts/use-accounts-query'
import { SelectField } from '@/components/select-field'

type HistoryItem = components['schemas']['SendIntent']
type HistoryStatus = HistoryItem['status']

const statusOptions: { value: HistoryStatus | 'all'; label: string }[] = [
  { value: 'all', label: '全部状态' },
  { value: 'succeeded', label: '已成功' },
  { value: 'queued', label: '排队中' },
  { value: 'running', label: '执行中' },
  { value: 'retry_wait', label: '等待重试' },
  { value: 'failed', label: '失败' },
  { value: 'skipped', label: '已跳过' },
  { value: 'cancelled', label: '已取消' },
]

const statusMeta: Record<HistoryStatus, { label: string; variant: 'success' | 'warning' | 'destructive' | 'muted' | 'secondary' }> = {
  pending: { label: '待处理', variant: 'secondary' },
  queued: { label: '排队中', variant: 'warning' },
  running: { label: '执行中', variant: 'warning' },
  retry_wait: { label: '等待重试', variant: 'warning' },
  succeeded: { label: '已成功', variant: 'success' },
  failed: { label: '失败', variant: 'destructive' },
  skipped: { label: '已跳过', variant: 'muted' },
  cancelled: { label: '已取消', variant: 'muted' },
}

export function HistoryPage() {
  const token = getToken()
  const [search, setSearch] = useState('')
  const [accountFilter, setAccountFilter] = useState('all')
  const [friendFilter, setFriendFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<HistoryStatus | 'all'>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [selected, setSelected] = useState<HistoryItem | null>(null)
  const invalidDateRange = !!fromDate && !!toDate && fromDate > toDate

  const accountsQ = useAccountsQuery(token, { loadAll: true })
  const friendAccounts = accountFilter === 'all' ? accountsQ.accounts : accountsQ.accounts.filter((account) => account.id === accountFilter)
  const friendQueries = useQueries({
    queries: friendAccounts.map((account) => ({
      queryKey: ['history-friend-options', account.id],
      queryFn: async () => (await listAllFriendsForAccount(token as string, account.id)).map((item) => ({ id: item.friend_id ?? item.id, nickname: item.friend_nickname, display_name: item.friend_display_name })),
      enabled: !!token,
    })),
  })
  const filters = useMemo(() => ({
    account_id: accountFilter === 'all' ? undefined : accountFilter,
    friend_id: friendFilter === 'all' ? undefined : friendFilter,
    status: statusFilter === 'all' ? undefined : statusFilter,
    from: dateBoundary(fromDate, false),
    to: dateBoundary(toDate, true),
  }), [accountFilter, fromDate, friendFilter, statusFilter, toDate])
  const historyQ = useInfiniteQuery({
    queryKey: ['send-intents', filters],
    queryFn: ({ pageParam }) => listSendIntents(token as string, { ...filters, limit: 50, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled: !!token && !invalidDateRange,
  })

  const items = historyQ.data?.pages.flatMap((page) => page.items) ?? []
  const friendOptions = friendOptionsFromFriends(friendQueries.flatMap((query) => query.data ?? []))
  const friendOptionsLoading = friendQueries.some((query) => query.isPending)
  const visibleItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('zh-CN')
    if (!query) return items
    return items.filter((item) => [
      item.account.nickname,
      item.friend.display_name,
      item.task_id ?? '',
      item.task?.body ?? '',
      item.error_code ?? '',
    ].some((value) => value.toLocaleLowerCase('zh-CN').includes(query)))
  }, [items, search])
  const successCount = items.filter((item) => item.status === 'succeeded').length
  const attentionCount = items.filter((item) => ['failed', 'retry_wait'].includes(item.status)).length
  const hasFilters = !!search || accountFilter !== 'all' || friendFilter !== 'all' || statusFilter !== 'all' || !!fromDate || !!toDate

  function clearFilters() {
    setSearch('')
    setAccountFilter('all')
    setFriendFilter('all')
    setStatusFilter('all')
    setFromDate('')
    setToDate('')
  }

  function changeAccountFilter(value: string) {
    setAccountFilter(value)
    setFriendFilter('all')
  }

  if (accountsQ.isLoading || historyQ.isLoading) return <HistoryLoading />

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">发送记录</h1>
          <p className="mt-1 text-sm text-muted-foreground">查看每日火花维护的执行结果和失败原因。</p>
        </div>
        {hasFilters && <Button variant="outline" onClick={clearFilters}><X />清除筛选</Button>}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="记录总数" value={items.length} />
        <SummaryCard label="已成功" value={successCount} tone="text-emerald-600" />
        <SummaryCard label="需要关注" value={attentionCount} tone={attentionCount ? 'text-amber-600' : undefined} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div><CardTitle>执行记录</CardTitle><CardDescription>{visibleItems.length === items.length ? `共 ${items.length} 条记录` : `筛选出 ${visibleItems.length} / ${items.length} 条记录`}</CardDescription></div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Filter className="size-4" />默认加载最近 50 条</div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <HistoryFilters search={search} onSearch={setSearch} account={accountFilter} onAccount={changeAccountFilter} friend={friendFilter} onFriend={setFriendFilter} status={statusFilter} onStatus={setStatusFilter} fromDate={fromDate} onFromDate={setFromDate} toDate={toDate} onToDate={setToDate} accounts={accountsQ.accounts} friends={friendOptions} friendsLoading={friendOptionsLoading} />
          {invalidDateRange ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50/60 px-4 py-10 text-center dark:border-amber-900 dark:bg-amber-950/20"><p className="font-medium">日期范围无效</p><p className="mt-1 text-sm text-muted-foreground">结束日期需要晚于或等于开始日期。</p></div>
          ) : historyQ.isError ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-10 text-center"><p className="font-medium">发送记录暂时不可用</p><p className="mt-1 text-sm text-muted-foreground">请稍后重试，或检查后端服务状态。</p><Button className="mt-4" variant="outline" onClick={() => void historyQ.refetch()}>重新加载</Button></div>
          ) : visibleItems.length ? (
            <>
              <div className="hidden md:block"><HistoryTable items={visibleItems} onSelect={setSelected} /></div>
              <div className="space-y-3 md:hidden"><HistoryCards items={visibleItems} onSelect={setSelected} /></div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-14 text-center"><CalendarDays className="size-8 text-muted-foreground" /><p className="mt-3 font-medium">暂无发送记录</p><p className="mt-1 text-sm text-muted-foreground">任务开始执行后，记录会出现在这里。</p></div>
          )}
          {historyQ.hasNextPage && <div className="flex justify-center"><Button variant="outline" onClick={() => void historyQ.fetchNextPage()} disabled={historyQ.isFetchingNextPage}>{historyQ.isFetchingNextPage ? '加载中…' : '加载更多记录'}</Button></div>}
        </CardContent>
      </Card>
      {selected && <HistoryDetailDrawer intent={selected} token={token as string} onClose={() => setSelected(null)} />}
    </div>
  )
}

function HistoryFilters({ search, onSearch, account, onAccount, friend, onFriend, status, onStatus, fromDate, onFromDate, toDate, onToDate, accounts, friends, friendsLoading }: {
  search: string
  onSearch: (value: string) => void
  account: string
  onAccount: (value: string) => void
  friend: string
  onFriend: (value: string) => void
  status: HistoryStatus | 'all'
  onStatus: (value: HistoryStatus | 'all') => void
  fromDate: string
  onFromDate: (value: string) => void
  toDate: string
  onToDate: (value: string) => void
  accounts: { id: string; nickname?: string | null }[]
  friends: [string, string][]
  friendsLoading: boolean
}) {
  return <div className="grid gap-3 border-b pb-4 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.4fr)_repeat(2,minmax(140px,1fr))_repeat(2,minmax(135px,1fr))]">
    <div className="space-y-1.5"><Label htmlFor="history-search">搜索记录</Label><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="history-search" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="账号、会话或失败原因" className="pl-9" /></div></div>
    <HistorySelect id="history-account" label="账号" value={account} onChange={onAccount} options={[{ value: 'all', label: '全部账号' }, ...accounts.map((item) => ({ value: item.id, label: item.nickname || '未命名账号' }))]} />
    <HistorySelect id="history-friend" label="会话" value={friend} disabled={friendsLoading} onChange={onFriend} options={friendsLoading ? [{ value: 'all', label: '加载会话中…' }] : [{ value: 'all', label: '全部会话' }, ...friends.map(([value, label]) => ({ value, label }))]} />
    <HistorySelect id="history-status" label="状态" value={status} onChange={(value) => onStatus(value as HistoryStatus | 'all')} options={statusOptions} />
    <div className="space-y-1.5"><Label htmlFor="history-from">开始日期</Label><DatePicker id="history-from" aria-label="开始日期" value={parseInputDate(fromDate)} onChange={(value) => onFromDate(formatInputDate(value))} /></div>
    <div className="space-y-1.5"><Label htmlFor="history-to">结束日期</Label><DatePicker id="history-to" aria-label="结束日期" value={parseInputDate(toDate)} onChange={(value) => onToDate(formatInputDate(value))} /></div>
  </div>
}

function HistorySelect({ id, label, value, onChange, options, disabled }: { id: string; label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; disabled?: boolean }) {
  return <SelectField id={id} label={label} value={value} disabled={disabled} onChange={onChange} options={options} />
}

function parseInputDate(value: string) {
  if (!value) return undefined
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatInputDate(value: Date | undefined) {
  if (!value) return ''
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
}

function HistoryTable({ items, onSelect }: { items: HistoryItem[]; onSelect: (item: HistoryItem) => void }) {
  return <Table className="min-w-[760px] table-fixed"><TableHeader><TableRow><TableHead className="w-[20%] pl-5">时间</TableHead><TableHead className="w-[24%]">账号 / 会话</TableHead><TableHead className="w-[16%]">任务</TableHead><TableHead className="w-[22%]">状态</TableHead><TableHead className="w-[18%] pr-5 text-right">详情</TableHead></TableRow></TableHeader><TableBody>{items.map((item) => <HistoryRow key={item.id} item={item} onSelect={onSelect} />)}</TableBody></Table>
}

function HistoryRow({ item, onSelect }: { item: HistoryItem; onSelect: (item: HistoryItem) => void }) {
  const status = statusMeta[item.status]
  return <TableRow><TableCell className="whitespace-nowrap pl-5 text-sm">{formatDateTime(item.scheduled_at)}</TableCell><TableCell><div className="font-medium">{item.friend.display_name}</div><div className="mt-1 text-xs text-muted-foreground">{item.account.nickname || '未命名账号'}</div></TableCell><TableCell><div className="text-sm">{taskLabel(item)}</div><div className="mt-1 text-xs text-muted-foreground">{item.intent_type === 'manual' ? '手动执行' : '定时执行'}</div></TableCell><TableCell><Badge variant={status.variant}>{status.label}</Badge></TableCell><TableCell className="pr-5 text-right"><Button variant="ghost" size="sm" onClick={() => onSelect(item)}>查看详情<ChevronRight /></Button></TableCell></TableRow>
}

function HistoryCards({ items, onSelect }: { items: HistoryItem[]; onSelect: (item: HistoryItem) => void }) {
  return <div>{items.map((item) => { const status = statusMeta[item.status]; return <button key={item.id} type="button" onClick={() => onSelect(item)} className="w-full rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent/40"><div className="flex items-start justify-between gap-3"><div><div className="font-medium">{item.friend.display_name}</div><div className="mt-1 text-xs text-muted-foreground">{item.account.nickname || '未命名账号'} · {formatDateTime(item.scheduled_at)}</div></div><Badge variant={status.variant}>{status.label}</Badge></div><div className="mt-4 text-sm"><div className="text-xs text-muted-foreground">任务</div><div className="mt-1 truncate">{taskLabel(item)}</div></div><div className="mt-3 flex items-center justify-end text-xs font-medium text-primary">查看详情<ChevronRight className="ml-1 size-3.5" /></div></button> })}</div>
}

function HistoryLoading() {
  return <div className="space-y-6"><Skeleton className="h-20 w-full" /><div className="grid gap-3 sm:grid-cols-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div><Skeleton className="h-[420px] w-full" /></div>
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return <Card><CardContent className="p-5"><div className="text-xs text-muted-foreground">{label}</div><div className={`mt-1 text-2xl font-semibold ${tone ?? ''}`}>{value}</div></CardContent></Card>
}

function taskLabel(item: HistoryItem) {
  if (item.task?.body) return item.task.body
  if (item.task?.message_kind === 'sticker') return '贴纸消息'
  return item.task_id ? `任务 ${item.task_id.slice(0, 8)}` : '临时发送'
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function dateBoundary(value: string, end: boolean) {
  if (!value) return undefined
  return new Date(`${value}T${end ? '23:59:59.999' : '00:00:00'}`).toISOString()
}
