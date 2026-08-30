import { useMemo, useState, type ReactNode } from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { listConversations, listTasks, requestPlatformConversationArchive, setConversationArchived, syncAccountConversations, type components, updateFriend, updateTask } from '@douyin-keeper/sdk-ts'
import { Avatar, AvatarFallback, AvatarImage, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@douyin-keeper/ui-web'
import { Archive, ArchiveRestore, Clock3, CloudCog, Filter, MessageCircle, RefreshCw, Search, Settings2, Smartphone, X } from 'lucide-react'
import { toast } from 'sonner'

import { getToken } from '@/auth/session'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { SelectField } from '@/components/select-field'
import { jobErrorMessageFromError } from '@/lib/job-error-message'
import { waitForJobEvents } from '@/lib/job-progress'
import { canSyncFriends } from '../accounts/account-detail-utils'
import { useAccountsQuery } from '../accounts/use-accounts-query'
import { filterFriends } from '../friends/friend-filters'
import { isValidBulkWindow, normalizeTimeInput, selectAllResolvedFriends, tasksForSelectedFriends, toggleSelectedFriend } from '../friends/friend-bulk-utils'
import type { Friend, SparkFilter, TaskFilter } from '../friends/friend-types'
import { FriendTable } from '../friends/friend-table'
import { directFriendsFromConversations } from './conversation-pagination'

type Conversation = components['schemas']['Conversation']
type IdempotencyKey = ReturnType<typeof crypto.randomUUID>
export function ConversationsPage() {
  const token = getToken()
  const queryClient = useQueryClient()
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>()
  const [search, setSearch] = useState('')
  const [sparkFilter, setSparkFilter] = useState<SparkFilter>('all')
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('all')
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([])
  const [pendingFriendId, setPendingFriendId] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkWindowOpen, setBulkWindowOpen] = useState(false)
  const [platformArchiveTarget, setPlatformArchiveTarget] = useState<{ conversation: Conversation; archived: boolean; label: string; confirmLabel: string; idempotencyKey: IdempotencyKey } | null>(null)

  const accountsQ = useAccountsQuery(token, { loadAll: true })
  const accountId = selectedAccountId ?? accountsQ.accounts[0]?.id
  const selectedAccount = accountsQ.accounts.find((account) => account.id === accountId)
  const tasksQ = useQuery({ queryKey: ['tasks'], queryFn: () => listTasks(token as string), enabled: !!token })
  const conversationsQ = useInfiniteQuery({
    queryKey: ['conversations', accountId],
    queryFn: ({ pageParam }) => listConversations(token as string, accountId as string, { limit: 100, cursor: pageParam, include_archived: false, group_only: false }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled: !!token && !!accountId,
  })

  const tasks = tasksQ.data?.items ?? []
  const conversations = conversationsQ.data?.pages.flatMap((page) => page.items) ?? []
  const friends = directFriendsFromConversations(conversations)
  const visibleFriends = useMemo(() => filterFriends(friends, tasks, { search, sparkFilter, taskFilter, accountId }), [accountId, friends, search, sparkFilter, taskFilter, tasks])
  const selectedFriends = friends.filter((friend) => selectedFriendIds.includes(friend.id) && friend.platform_identity_status === 'resolved')
  const selectedTasks = tasksForSelectedFriends(tasks, accountId, selectedFriends.map((friend) => friend.id))
  const archivedCount = conversations.filter((item) => item.archived).length
  const hasFilters = !!search || sparkFilter !== 'all' || taskFilter !== 'all'

  const syncMutation = useMutation({
    mutationFn: async () => { const job = await syncAccountConversations(token as string, accountId as string); await waitForJobEvents(token as string, job.job_id) },
    onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ['conversations', accountId] }), queryClient.invalidateQueries({ queryKey: ['accounts'] })]); toast.success('会话同步完成') },
    onError: async (error) => {
      await queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.error(jobErrorMessageFromError(error, '会话同步失败，请确认账号登录状态后重试。'))
    },
  })
  const archiveMutation = useMutation({
    mutationFn: ({ conversationId, archived }: { conversationId: string; archived: boolean }) => setConversationArchived(token as string, accountId as string, conversationId, archived),
    onSuccess: (updated) => { void queryClient.invalidateQueries({ queryKey: ['conversations', accountId] }); toast.success(updated.archived ? '会话已归档' : '会话已恢复') },
    onError: (error) => toast.error(jobErrorMessageFromError(error, '更新会话归档状态失败，请稍后再试。')),
  })
  const platformArchiveMutation = useMutation({
    mutationFn: ({ conversationId, archived, idempotencyKey }: { conversationId: string; archived: boolean; idempotencyKey: IdempotencyKey }) => requestPlatformConversationArchive(token as string, accountId as string, conversationId, archived, idempotencyKey),
    onSuccess: () => { setPlatformArchiveTarget(null); toast.success('平台归档任务已提交，等待后台与适配器确认') },
    onError: (error) => toast.error(jobErrorMessageFromError(error, '提交平台归档任务失败，平台状态未改变。请稍后再试。')),
  })

  function selectAccount(nextAccountId: string) {
    setSelectedAccountId(nextAccountId)
    setSelectedFriendIds([])
    setBulkWindowOpen(false)
  }

  function selectAllVisible(checked: boolean) {
    const visibleIds = selectAllResolvedFriends(visibleFriends)
    setSelectedFriendIds((current) => checked ? [...new Set([...current, ...visibleIds])] : current.filter((id) => !visibleIds.includes(id)))
  }

  async function handleToggle(friend: Friend, enabled: boolean) {
    if (!token) return
    setPendingFriendId(friend.id)
    try {
      await updateFriend(token, friend.id, enabled)
      await queryClient.invalidateQueries({ queryKey: ['conversations', accountId] })
      toast.success(enabled ? '已开启火花维护' : '已关闭火花维护')
    } catch (error) {
      toast.error(jobErrorMessageFromError(error, '更新火花状态失败，请稍后再试。'))
    } finally {
      setPendingFriendId(null)
    }
  }

  async function handleBulkSpark(enabled: boolean) {
    if (!token || !selectedFriends.length) return
    setBulkBusy(true)
    const selected = [...selectedFriends]
    const results = await Promise.allSettled(selected.map((friend) => updateFriend(token, friend.id, enabled)))
    const failed = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    await queryClient.invalidateQueries({ queryKey: ['conversations', accountId] })
    setBulkBusy(false)
    if (failed.length) {
      setSelectedFriendIds(selected.filter((_, index) => results[index].status === 'rejected').map((friend) => friend.id))
      toast.error(`${selected.length - failed.length} 条会话已更新，${failed.length} 条失败，请检查后重试`)
      return
    }
    setSelectedFriendIds([])
    toast.success(`${selected.length} 条会话已${enabled ? '开启' : '关闭'}火花维护`)
  }

  async function handleBulkWindow(start: string, end: string) {
    if (!token || !selectedTasks.length) return
    if (!isValidBulkWindow(start, end)) {
      toast.error('时间窗口无效，结束时间必须晚于开始时间且不能跨午夜')
      return
    }
    setBulkBusy(true)
    const results = await Promise.allSettled(selectedTasks.map((task) => updateTask(token, task.id, { window_start: normalizeTimeInput(start), window_end: normalizeTimeInput(end) })))
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

  if (accountsQ.isLoading) return <ConversationsLoading />
  if (!accountsQ.accounts.length) return <Card><CardHeader><CardTitle className="flex items-center gap-2"><MessageCircle className="size-5 text-primary" />会话</CardTitle><CardDescription>先绑定一个抖音账号，再从消息面板同步会话。</CardDescription></CardHeader><CardContent><Button asChild><Link to="/accounts">前往绑定账号</Link></Button></CardContent></Card>

  const sessionCount = conversations.length

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="text-sm font-medium text-primary">M2 · 关系管理</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">会话</h1><p className="mt-1 text-sm text-muted-foreground">好友与群聊统一维护火花；数据全部来自抖音消息面板。</p></div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <Button variant="outline" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending || !accountId || !canSyncFriends(selectedAccount)} title={!canSyncFriends(selectedAccount) ? '请重新登录后再同步会话' : undefined}><RefreshCw className={syncMutation.isPending ? 'animate-spin' : undefined} />{syncMutation.isPending ? '同步中…' : '同步会话'}</Button>
          <p className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground" aria-live="polite"><Clock3 className="size-3.5" />上次成功同步：{formatDate(selectedAccount?.last_friend_sync_at)}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4"><SummaryCard label="当前账号" value={selectedAccount?.nickname || '未命名账号'} /><SummaryCard label="会话总数" value={sessionCount} /><SummaryCard label="已开启火花" value={friends.filter((friend) => friend.spark_enabled).length} /><SummaryCard label="已归档" value={archivedCount} /></div>

      <Card>
        <CardHeader><div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start"><div><CardTitle>全部会话</CardTitle><CardDescription>{hasFilters ? `筛选出 ${visibleFriends.length} / ${sessionCount} 条` : `共 ${sessionCount} 条会话 · 已归档 ${archivedCount} 条`}</CardDescription></div><div className="flex items-center gap-2 text-xs text-muted-foreground"><Filter className="size-4" />统一维护入口</div></div></CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_repeat(3,minmax(150px,1fr))]"><div className="space-y-1.5"><Label htmlFor="conversation-search">搜索会话</Label><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="conversation-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="昵称或群聊名称" className="pl-9" /></div></div><ConversationSelect label="账号" value={accountId ?? ''} onChange={selectAccount} options={accountsQ.accounts.map((account) => ({ value: account.id, label: account.nickname || '未命名账号' }))} /><ConversationSelect label="火花状态" value={sparkFilter} onChange={(value) => setSparkFilter(value as SparkFilter)} options={[{ value: 'all', label: '全部' }, { value: 'enabled', label: '已开启' }, { value: 'disabled', label: '未开启' }]} /><ConversationSelect label="任务状态" value={taskFilter} onChange={(value) => setTaskFilter(value as TaskFilter)} options={[{ value: 'all', label: '全部' }, { value: 'enabled', label: '任务已启用' }, { value: 'disabled', label: '任务已停用' }, { value: 'none', label: '未配置任务' }]} /></div>
          {selectedFriends.length > 0 && <BulkActions selectedCount={selectedFriends.length} taskCount={selectedTasks.length} busy={bulkBusy} windowOpen={bulkWindowOpen} onEnable={() => void handleBulkSpark(true)} onDisable={() => void handleBulkSpark(false)} onOpenWindow={() => setBulkWindowOpen(true)} onClear={() => { setSelectedFriendIds([]); setBulkWindowOpen(false) }} />}
          {bulkWindowOpen && <BulkWindowPanel taskCount={selectedTasks.length} busy={bulkBusy} onClose={() => setBulkWindowOpen(false)} onSave={(start, end) => void handleBulkWindow(start, end)} />}
          <SessionSection title="全部会话" description={`${visibleFriends.length === friends.length ? `共 ${friends.length} 条` : `筛选出 ${visibleFriends.length} / ${friends.length} 条`} · 直接会话与群聊都可以开启火花维护`} loading={conversationsQ.isLoading} error={conversationsQ.isError ? '会话数据暂时不可用，请稍后重试。' : undefined} empty={!visibleFriends.length} emptyText={hasFilters ? '没有符合条件的会话' : '还没有会话数据'}><FriendTable friends={visibleFriends} tasks={tasks} accountId={accountId} pendingFriendId={pendingFriendId} bulkBusy={bulkBusy} selectedFriendIds={selectedFriendIds} selectionEnabled onSelectFriend={(friendId, checked) => setSelectedFriendIds((current) => toggleSelectedFriend(current, friendId, checked))} onSelectAll={selectAllVisible} onToggle={(friend, enabled) => void handleToggle(friend, enabled)} /></SessionSection>
          {conversationsQ.hasNextPage && <div className="flex justify-center border-t pt-4"><Button variant="outline" onClick={() => void conversationsQ.fetchNextPage()} disabled={conversationsQ.isFetchingNextPage}>{conversationsQ.isFetchingNextPage ? '加载中…' : '加载更多会话'}</Button></div>}
        </CardContent>
      </Card>
      {tasksQ.isError && <p className="text-xs text-muted-foreground">任务状态暂时不可用，会话仍可正常管理火花开关。</p>}
      <ConfirmDialog open={!!platformArchiveTarget} onOpenChange={(open) => { if (!open && !platformArchiveMutation.isPending) setPlatformArchiveTarget(null) }} title={`${platformArchiveTarget?.label ?? '提交平台操作'}？`} description={platformArchiveTarget?.confirmLabel ?? '确认提交这个平台操作吗？'} impact="这会创建后台任务请求抖音平台变更状态，平台最终结果以适配器确认事件为准。" confirmLabel="提交请求" pending={platformArchiveMutation.isPending} onConfirm={() => { if (platformArchiveTarget) platformArchiveMutation.mutate({ conversationId: platformArchiveTarget.conversation.id, archived: platformArchiveTarget.archived, idempotencyKey: platformArchiveTarget.idempotencyKey }) }} />
    </div>
  )
}

function SessionSection({ title, description, loading, error, empty, emptyText, children }: { title: string; description: string; loading: boolean; error?: string; empty: boolean; emptyText: string; children: ReactNode }) { return <section className="space-y-3"><div><h2 className="text-base font-semibold">{title}</h2><p className="mt-1 text-xs text-muted-foreground">{description}</p></div>{loading ? <Skeleton className="h-56 w-full" /> : error ? <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-10 text-center text-sm text-destructive">{error}</div> : empty ? <EmptyState text={emptyText} /> : children}</section> }

function ConversationContent({ items, onArchive, onPlatformArchive, pendingConversationId, pendingPlatformConversationId }: { items: Conversation[]; onArchive: (conversationId: string, archived: boolean) => void; onPlatformArchive: (conversationId: string, archived: boolean) => void; pendingConversationId?: string; pendingPlatformConversationId?: string }) { return <><div className="hidden md:block"><ConversationTable items={items} onArchive={onArchive} onPlatformArchive={onPlatformArchive} pendingConversationId={pendingConversationId} pendingPlatformConversationId={pendingPlatformConversationId} /></div><div className="space-y-3 md:hidden">{items.map((item) => <ConversationCard key={item.id} item={item} onArchive={onArchive} onPlatformArchive={onPlatformArchive} pending={pendingConversationId === item.id} platformPending={pendingPlatformConversationId === item.id} />)}</div></> }

function ConversationTable({ items, onArchive, onPlatformArchive, pendingConversationId, pendingPlatformConversationId }: { items: Conversation[]; onArchive: (conversationId: string, archived: boolean) => void; onPlatformArchive: (conversationId: string, archived: boolean) => void; pendingConversationId?: string; pendingPlatformConversationId?: string }) { return <Table className="min-w-[680px]"><TableHeader><TableRow><TableHead className="pl-5">群聊会话</TableHead><TableHead>最近同步</TableHead><TableHead className="pr-5 text-right">操作</TableHead></TableRow></TableHeader><TableBody>{items.map((item) => <TableRow key={item.id}><TableCell className="pl-5"><ConversationPeer item={item} /></TableCell><TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDate(item.last_synced_at)}</TableCell><TableCell className="pr-5 text-right"><div className="flex justify-end gap-1"><ArchiveButton item={item} onArchive={onArchive} pending={pendingConversationId === item.id} /><PlatformArchiveButton item={item} onPlatformArchive={onPlatformArchive} pending={pendingPlatformConversationId === item.id} /></div></TableCell></TableRow>)}</TableBody></Table> }

function ConversationCard({ item, onArchive, onPlatformArchive, pending, platformPending }: { item: Conversation; onArchive: (conversationId: string, archived: boolean) => void; onPlatformArchive: (conversationId: string, archived: boolean) => void; pending: boolean; platformPending: boolean }) { return <div className="rounded-xl border bg-card p-4"><div className="flex items-start justify-between gap-3"><ConversationPeer item={item} /></div><div className="mt-3 text-xs text-muted-foreground">最近同步 {formatDate(item.last_synced_at)}</div><div className="mt-4 flex flex-wrap justify-end gap-1"><ArchiveButton item={item} onArchive={onArchive} pending={pending} /><PlatformArchiveButton item={item} onPlatformArchive={onPlatformArchive} pending={platformPending} /></div></div> }

function ArchiveButton({ item, onArchive, pending }: { item: Conversation; onArchive: (conversationId: string, archived: boolean) => void; pending: boolean }) { const nextArchived = !item.archived; return <Button variant="ghost" size="sm" disabled={pending} onClick={() => onArchive(item.id, nextArchived)} aria-label={nextArchived ? '归档会话' : '恢复会话'}>{nextArchived ? <Archive className="mr-1.5 size-4" /> : <ArchiveRestore className="mr-1.5 size-4" />}{pending ? '处理中…' : nextArchived ? '归档' : '恢复'}</Button> }

function PlatformArchiveButton({ item, onPlatformArchive, pending }: { item: Conversation; onPlatformArchive: (conversationId: string, archived: boolean) => void; pending: boolean }) { const archived = !item.archived; return <Button variant="outline" size="sm" disabled={pending} onClick={() => onPlatformArchive(item.id, archived)} aria-label={archived ? '请求平台归档' : '请求平台恢复'}><CloudCog className="mr-1.5 size-4" />{pending ? '提交中…' : archived ? '请求平台归档' : '请求平台恢复'}</Button> }

function ConversationPeer({ item }: { item: Conversation }) { return <div className="flex min-w-[210px] items-center gap-3"><Avatar className="size-9"><AvatarImage src={item.friend_avatar_url ?? undefined} alt="" /><AvatarFallback><Smartphone className="size-4" /></AvatarFallback></Avatar><div className="min-w-0"><div className="truncate font-medium">{item.friend_nickname || item.friend_display_name}</div><div className="mt-0.5 truncate text-xs text-muted-foreground">群聊会话 · {item.friend_display_name}</div></div></div> }

function ConversationSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) { const id = `conversation-filter-${label}`; return <SelectField id={id} label={label} value={value} onChange={onChange} options={options} /> }
function SummaryCard({ label, value }: { label: string; value: string | number }) { return <Card><CardContent className="p-5"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 truncate text-xl font-semibold">{value}</div></CardContent></Card> }
function EmptyState({ text }: { text: string }) { return <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-10 text-center"><MessageCircle className="size-8 text-muted-foreground" /><p className="mt-3 font-medium">{text}</p></div> }

function BulkActions({ selectedCount, taskCount, busy, windowOpen, onEnable, onDisable, onOpenWindow, onClear }: { selectedCount: number; taskCount: number; busy: boolean; windowOpen: boolean; onEnable: () => void; onDisable: () => void; onOpenWindow: () => void; onClear: () => void }) { return <div className="flex flex-col gap-3 rounded-lg border border-primary/20 bg-primary/[0.03] p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium">已选择 {selectedCount} 条会话</p><p className="mt-1 text-xs text-muted-foreground">{taskCount ? `${taskCount} 个已有任务可调整时间窗口` : '所选会话暂无已配置任务'}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={onEnable}>开启维护</Button><Button size="sm" variant="outline" disabled={busy} onClick={onDisable}>关闭维护</Button><Button size="sm" variant="outline" disabled={busy || !taskCount} onClick={onOpenWindow}><Settings2 />{windowOpen ? '正在设置' : '设置时间窗口'}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={onClear}>清除选择</Button></div></div> }

function BulkWindowPanel({ taskCount, busy, onClose, onSave }: { taskCount: number; busy: boolean; onClose: () => void; onSave: (start: string, end: string) => void }) { const [start, setStart] = useState('19:30'); const [end, setEnd] = useState('22:30'); return <Card className="border-primary/30"><CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0"><div><CardTitle className="text-base">批量设置时间窗口</CardTitle><CardDescription>将更新 {taskCount} 个已有任务；没有任务的会话不会自动创建任务。</CardDescription></div><Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭批量时间窗口设置"><X /></Button></CardHeader><CardContent><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="bulk-window-start">开始时间</Label><Input id="bulk-window-start" type="time" value={start} onChange={(event) => setStart(event.target.value)} /></div><div className="space-y-1.5"><Label htmlFor="bulk-window-end">结束时间</Label><Input id="bulk-window-end" type="time" value={end} onChange={(event) => setEnd(event.target.value)} /></div></div><p className="mt-3 text-xs text-muted-foreground">时间窗口不支持跨午夜，时区沿用每个任务现有配置。</p><div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={onClose} disabled={busy}>取消</Button><Button onClick={() => onSave(start, end)} disabled={busy}>{busy ? '保存中…' : '应用到已选会话'}</Button></div></CardContent></Card> }

function ConversationsLoading() { return <div className="space-y-6"><Skeleton className="h-20 w-full" /><div className="grid gap-3 sm:grid-cols-4"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div><Skeleton className="h-[520px] w-full" /></div> }
function formatDate(value: string | null | undefined) { return value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '暂无' }
