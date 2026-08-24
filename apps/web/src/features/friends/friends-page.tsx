import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Link } from '@tanstack/react-router'
import { listAccounts, listFriends, listTasks, syncAccountFriends, updateFriend, updateTask } from '@douyin-keeper/sdk-ts'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Skeleton } from '@douyin-keeper/ui-web'
import { Filter, RefreshCw, Search, Settings2, Sparkles, X } from 'lucide-react'

import { getToken } from '@/auth/session'
import { waitForJobEvents } from '@/lib/job-progress'
import { filterFriends } from './friend-filters'
import type { Friend, SparkFilter, TaskFilter } from './friend-types'
import { FriendTable } from './friend-table'
import { isValidBulkWindow, normalizeTimeInput, selectAllResolvedFriends, tasksForSelectedFriends, toggleSelectedFriend } from './friend-bulk-utils'

export function FriendsPage() {
  const token = getToken()
  const queryClient = useQueryClient()
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>()
  const [search, setSearch] = useState('')
  const [sparkFilter, setSparkFilter] = useState<SparkFilter>('all')
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('all')
  const [pendingFriendId, setPendingFriendId] = useState<string | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([])
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkWindowOpen, setBulkWindowOpen] = useState(false)

  const accountsQ = useQuery({
    queryKey: ['accounts'],
    queryFn: () => listAccounts(token as string),
    enabled: !!token,
  })
  const accountId = selectedAccountId ?? accountsQ.data?.items[0]?.id
  const selectedAccount = accountsQ.data?.items.find((account) => account.id === accountId)
  const friendsQ = useQuery({
    queryKey: ['friends', accountId],
    queryFn: () => listFriends(token as string, accountId as string, { limit: 100 }),
    enabled: !!token && !!accountId,
  })
  const tasksQ = useQuery({
    queryKey: ['tasks'],
    queryFn: () => listTasks(token as string),
    enabled: !!token,
  })

  const friends = friendsQ.data?.items ?? []
  const tasks = tasksQ.data?.items ?? []
  const visibleFriends = useMemo(
    () => filterFriends(friends, tasks, { search, sparkFilter, taskFilter, accountId }),
    [accountId, friends, search, sparkFilter, taskFilter, tasks],
  )
  const accountTasks = tasks.filter((task) => task.account_id === accountId)
  const sparkEnabledCount = friends.filter((friend) => friend.spark_enabled).length
  const selectedFriends = friends.filter((friend) => selectedFriendIds.includes(friend.id) && friend.platform_identity_status === 'resolved')
  const selectedTasks = tasksForSelectedFriends(tasks, accountId, selectedFriends.map((friend) => friend.id))

  function selectAccount(nextAccountId: string) {
    setSelectedAccountId(nextAccountId)
    setSelectedFriendIds([])
    setBulkWindowOpen(false)
  }

  function selectFriend(friendId: string, checked: boolean) {
    setSelectedFriendIds((current) => toggleSelectedFriend(current, friendId, checked))
  }

  function selectAllVisible(checked: boolean) {
    const visibleIds = selectAllResolvedFriends(visibleFriends)
    setSelectedFriendIds((current) => {
      if (checked) return [...new Set([...current, ...visibleIds])]
      return current.filter((id) => !visibleIds.includes(id))
    })
  }

  async function handleToggle(friend: Friend, enabled: boolean) {
    if (!token) return
    setPendingFriendId(friend.id)
    try {
      await updateFriend(token, friend.id, enabled)
      await queryClient.invalidateQueries({ queryKey: ['friends', accountId] })
      toast.success(enabled ? '已开启火花维护' : '已关闭火花维护')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '更新火花状态失败')
    } finally {
      setPendingFriendId(null)
    }
  }

  async function handleSync() {
    if (!token || !accountId) return
    setIsSyncing(true)
    try {
      const job = await syncAccountFriends(token, accountId)
      await waitForJobEvents(token, job.job_id)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['friends', accountId] }),
        queryClient.invalidateQueries({ queryKey: ['accounts'] }),
      ])
      toast.success('好友同步完成')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '好友同步失败')
    } finally {
      setIsSyncing(false)
    }
  }

  async function handleBulkSpark(enabled: boolean) {
    if (!token || !selectedFriends.length) return
    setBulkBusy(true)
    const selected = [...selectedFriends]
    const results = await Promise.allSettled(selected.map((friend) => updateFriend(token, friend.id, enabled)))
    const failed = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    await queryClient.invalidateQueries({ queryKey: ['friends', accountId] })
    setBulkBusy(false)
    if (failed.length) {
      setSelectedFriendIds(selected.filter((_, index) => results[index].status === 'rejected').map((friend) => friend.id))
      toast.error(`${selected.length - failed.length} 位好友已更新，${failed.length} 位失败，请检查后重试`)
      return
    }
    setSelectedFriendIds([])
    toast.success(`${selected.length} 位好友已${enabled ? '开启' : '关闭'}火花维护`)
  }

  async function handleBulkWindow(start: string, end: string) {
    if (!token || !selectedTasks.length) return
    if (!isValidBulkWindow(start, end)) {
      toast.error('时间窗口无效，结束时间必须晚于开始时间且不能跨午夜')
      return
    }
    setBulkBusy(true)
    const normalizedStart = normalizeTimeInput(start)
    const normalizedEnd = normalizeTimeInput(end)
    const results = await Promise.allSettled(selectedTasks.map((task) => updateTask(token, task.id, { window_start: normalizedStart, window_end: normalizedEnd })))
    const failed = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    await queryClient.invalidateQueries({ queryKey: ['tasks'] })
    setBulkBusy(false)
    if (failed.length) {
      setSelectedFriendIds(selectedTasks.filter((_, index) => results[index].status === 'rejected').map((task) => task.friend_id))
      toast.error(`${selectedTasks.length - failed.length} 个任务已更新，${failed.length} 个失败，请检查后重试`)
      return
    }
    setSelectedFriendIds([])
    setBulkWindowOpen(false)
    toast.success(`${selectedTasks.length} 个任务的时间窗口已更新`)
  }

  if (accountsQ.isLoading) {
    return <div className="space-y-6"><Skeleton className="h-20 w-full" /><Skeleton className="h-72 w-full" /></div>
  }

  if (!accountsQ.data?.items.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="size-5 text-primary" />好友与火花</CardTitle>
          <CardDescription>先绑定一个抖音账号，再同步好友并开启火花维护。</CardDescription>
        </CardHeader>
        <CardContent><Button asChild><Link to="/accounts">前往绑定账号</Link></Button></CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-primary">M2 · 好友同步</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">好友与火花</h1>
          <p className="mt-1 text-sm text-muted-foreground">按账号管理稳定好友身份、会话状态和火花维护开关。</p>
        </div>
        <Button variant="outline" onClick={() => void handleSync()} disabled={isSyncing || !accountId}>
          <RefreshCw className={isSyncing ? 'animate-spin' : undefined} />
          {isSyncing ? '同步中…' : '同步好友'}
        </Button>
      </div>

      <Card>
        <CardContent className="grid gap-4 p-5 sm:grid-cols-3">
          <div><div className="text-xs text-muted-foreground">当前账号</div><div className="mt-1 font-medium">{selectedAccount?.nickname || '未命名账号'}</div></div>
          <div><div className="text-xs text-muted-foreground">好友总数</div><div className="mt-1 text-xl font-semibold">{friends.length}</div></div>
          <div><div className="text-xs text-muted-foreground">已开启火花</div><div className="mt-1 text-xl font-semibold text-primary">{sparkEnabledCount}</div></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <CardTitle>好友列表</CardTitle>
              <CardDescription>{visibleFriends.length === friends.length ? `共 ${friends.length} 位好友` : `筛选出 ${visibleFriends.length} / ${friends.length} 位好友`}</CardDescription>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Filter className="size-4" />筛选条件即时生效</div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[minmax(180px,1fr)_repeat(3,minmax(130px,170px))]">
            <div className="space-y-1.5">
              <Label htmlFor="friend-search">搜索好友</Label>
              <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="friend-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="昵称、备注或抖音号" className="pl-9" /></div>
            </div>
            <FilterSelect label="账号" value={accountId ?? ''} onChange={selectAccount} options={accountsQ.data.items.map((account) => ({ value: account.id, label: account.nickname || '未命名账号' }))} />
            <FilterSelect label="火花状态" value={sparkFilter} onChange={(value) => setSparkFilter(value as SparkFilter)} options={[{ value: 'all', label: '全部' }, { value: 'enabled', label: '已开启' }, { value: 'disabled', label: '未开启' }]} />
            <FilterSelect label="任务状态" value={taskFilter} onChange={(value) => setTaskFilter(value as TaskFilter)} options={[{ value: 'all', label: '全部' }, { value: 'enabled', label: '任务已启用' }, { value: 'disabled', label: '任务已停用' }, { value: 'none', label: '未配置任务' }]} />
          </div>

          {selectedFriends.length > 0 && <BulkActions selectedCount={selectedFriends.length} taskCount={selectedTasks.length} busy={bulkBusy} windowOpen={bulkWindowOpen} onEnable={() => void handleBulkSpark(true)} onDisable={() => void handleBulkSpark(false)} onOpenWindow={() => setBulkWindowOpen(true)} onClear={() => { setSelectedFriendIds([]); setBulkWindowOpen(false) }} />}
          {bulkWindowOpen && <BulkWindowPanel taskCount={selectedTasks.length} busy={bulkBusy} onClose={() => setBulkWindowOpen(false)} onSave={(start, end) => void handleBulkWindow(start, end)} />}
          {friendsQ.isLoading ? <Skeleton className="h-64 w-full" /> : friendsQ.isError ? <p className="py-10 text-center text-sm text-destructive">好友列表暂时不可用，请稍后重试。</p> : visibleFriends.length ? <FriendTable friends={visibleFriends} tasks={tasks} accountId={accountId} pendingFriendId={pendingFriendId} bulkBusy={bulkBusy} selectedFriendIds={selectedFriendIds} selectionEnabled onSelectFriend={selectFriend} onSelectAll={selectAllVisible} onToggle={(friend, enabled) => void handleToggle(friend, enabled)} /> : <EmptyFriends hasFilters={!!search || sparkFilter !== 'all' || taskFilter !== 'all'} onReset={() => { setSearch(''); setSparkFilter('all'); setTaskFilter('all') }} />}
        </CardContent>
      </Card>
      {tasksQ.isError && <p className="text-xs text-muted-foreground">任务状态暂时不可用，好友列表仍可正常管理火花开关。</p>}
      {accountTasks.length === 0 && <p className="text-xs text-muted-foreground">当前账号还没有火花任务，可在「任务」页创建。</p>}
    </div>
  )
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  const id = `friend-filter-${label}`
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring">
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  )
}

function EmptyFriends({ hasFilters, onReset }: { hasFilters: boolean; onReset: () => void }) {
  return <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center"><Sparkles className="size-8 text-muted-foreground" /><p className="mt-3 font-medium">{hasFilters ? '没有符合条件的好友' : '还没有好友数据'}</p>{hasFilters ? <Button className="mt-4" variant="outline" onClick={onReset}>清除筛选</Button> : <p className="mt-1 text-sm text-muted-foreground">点击“同步好友”获取最新列表。</p>}</div>
}

function BulkActions({ selectedCount, taskCount, busy, windowOpen, onEnable, onDisable, onOpenWindow, onClear }: { selectedCount: number; taskCount: number; busy: boolean; windowOpen: boolean; onEnable: () => void; onDisable: () => void; onOpenWindow: () => void; onClear: () => void }) {
  return <div className="flex flex-col gap-3 rounded-lg border border-primary/20 bg-primary/[0.03] p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium">已选择 {selectedCount} 位好友</p><p className="mt-1 text-xs text-muted-foreground">{taskCount ? `${taskCount} 个已有任务可调整时间窗口` : '所选好友暂无已配置任务'}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={onEnable}>开启维护</Button><Button size="sm" variant="outline" disabled={busy} onClick={onDisable}>关闭维护</Button><Button size="sm" variant="outline" disabled={busy || !taskCount} onClick={onOpenWindow}><Settings2 />{windowOpen ? '正在设置' : '设置时间窗口'}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={onClear}>清除选择</Button></div></div>
}

function BulkWindowPanel({ taskCount, busy, onClose, onSave }: { taskCount: number; busy: boolean; onClose: () => void; onSave: (start: string, end: string) => void }) {
  const [start, setStart] = useState('19:30')
  const [end, setEnd] = useState('22:30')
  return <Card className="border-primary/30"><CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0"><div><CardTitle className="text-base">批量设置时间窗口</CardTitle><CardDescription>将更新 {taskCount} 个已有任务；没有任务的好友不会自动创建任务。</CardDescription></div><Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭批量时间窗口设置"><X /></Button></CardHeader><CardContent><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="bulk-window-start">开始时间</Label><Input id="bulk-window-start" type="time" value={start} onChange={(event) => setStart(event.target.value)} /></div><div className="space-y-1.5"><Label htmlFor="bulk-window-end">结束时间</Label><Input id="bulk-window-end" type="time" value={end} onChange={(event) => setEnd(event.target.value)} /></div></div><p className="mt-3 text-xs text-muted-foreground">时间窗口不支持跨午夜，时区沿用每个任务现有配置。</p><div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={onClose} disabled={busy}>取消</Button><Button onClick={() => onSave(start, end)} disabled={busy}>{busy ? '保存中…' : '应用到已选任务'}</Button></div></CardContent></Card>
}
