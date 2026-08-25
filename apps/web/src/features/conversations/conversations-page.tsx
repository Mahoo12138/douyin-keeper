import { useMemo, useState } from 'react'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { listConversations, requestPlatformConversationArchive, setConversationArchived, syncAccountConversations, type components } from '@douyin-keeper/sdk-ts'
import { Avatar, AvatarFallback, AvatarImage, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@douyin-keeper/ui-web'
import { Archive, ArchiveRestore, CloudCog, Filter, MessageCircle, RefreshCw, Search, Smartphone } from 'lucide-react'
import { toast } from 'sonner'

import { getToken } from '@/auth/session'
import { waitForJobEvents } from '@/lib/job-progress'
import { useAccountsQuery } from '../accounts/use-accounts-query'
import { getPlatformArchiveAction } from './conversation-utils'
import { SelectField } from '@/components/select-field'
import { ConfirmDialog } from '@/components/confirm-dialog'

type Conversation = components['schemas']['Conversation']
type Channel = Conversation['channel'] | 'all'
type ArchiveFilter = 'active' | 'archived' | 'all'

export function ConversationsPage() {
  const token = getToken()
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>()
  const [search, setSearch] = useState('')
  const [channel, setChannel] = useState<Channel>('all')
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>('active')
  const [platformArchiveTarget, setPlatformArchiveTarget] = useState<{ conversation: Conversation; archived: boolean; label: string; confirmLabel: string } | null>(null)
  const queryClient = useQueryClient()

  const accountsQ = useAccountsQuery(token, { loadAll: true })
  const accountId = selectedAccountId ?? accountsQ.accounts[0]?.id
  const selectedAccount = accountsQ.accounts.find((account) => account.id === accountId)
  const conversationsQ = useInfiniteQuery({
    queryKey: ['conversations', accountId],
    queryFn: ({ pageParam }) => listConversations(token as string, accountId as string, { limit: 50, cursor: pageParam, include_archived: true }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled: !!token && !!accountId,
  })

  const archiveMutation = useMutation({
    mutationFn: ({ conversationId, archived }: { conversationId: string; archived: boolean }) =>
      setConversationArchived(token as string, accountId as string, conversationId, archived),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ['conversations', accountId] })
      toast.success(updated.archived ? '会话已归档' : '会话已恢复')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '更新会话归档状态失败'),
  })
  const platformArchiveMutation = useMutation({
    mutationFn: ({ conversationId, archived }: { conversationId: string; archived: boolean }) =>
      requestPlatformConversationArchive(token as string, accountId as string, conversationId, archived),
    onSuccess: () => { setPlatformArchiveTarget(null); toast.success('平台归档任务已提交，等待后台与适配器确认') },
    onError: (error) => toast.error(error instanceof Error ? error.message : '提交平台归档任务失败；平台状态未改变'),
  })
  const syncMutation = useMutation({
    mutationFn: async () => {
      const job = await syncAccountConversations(token as string, accountId as string)
      await waitForJobEvents(token as string, job.job_id)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['conversations', accountId] })
      toast.success('会话同步完成')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '会话同步失败'),
  })

  const conversations = conversationsQ.data?.pages.flatMap((page) => page.items) ?? []
  const visibleConversations = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('zh-CN')
    return conversations.filter((item) => {
      const matchesChannel = channel === 'all' || item.channel === channel
      const matchesArchive = archiveFilter === 'all' || (archiveFilter === 'archived' ? item.archived : !item.archived)
      const matchesSearch = !query || [item.friend_display_name, item.friend_nickname].some((value) => value.toLocaleLowerCase('zh-CN').includes(query))
      return matchesChannel && matchesArchive && matchesSearch
    })
  }, [archiveFilter, channel, conversations, search])
  const consumerCount = conversations.filter((item) => item.channel === 'consumer').length
  const creatorCount = conversations.filter((item) => item.channel === 'creator').length
  const archivedCount = conversations.filter((item) => item.archived).length

  if (accountsQ.isLoading) return <ConversationsLoading />

  if (!accountsQ.accounts.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MessageCircle className="size-5 text-primary" />会话列表</CardTitle>
          <CardDescription>先绑定并同步一个抖音账号，才能查看会话。</CardDescription>
        </CardHeader>
        <CardContent><Button asChild><Link to="/accounts">前往绑定账号</Link></Button></CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-primary">M2 · 会话索引</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">会话列表</h1>
        <p className="mt-1 text-sm text-muted-foreground">只展示已同步的真实会话，发送目标仍由平台身份和会话 ID 驱动；归档只影响本产品的会话索引。</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <SummaryCard label="当前账号" value={selectedAccount?.nickname || '未命名账号'} />
        <SummaryCard label="消费端会话" value={consumerCount} />
        <SummaryCard label="创作者会话" value={creatorCount} />
        <SummaryCard label="已归档" value={archivedCount} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div><CardTitle>已建立会话</CardTitle><CardDescription>{visibleConversations.length === conversations.length ? `共 ${conversations.length} 个会话` : `筛选出 ${visibleConversations.length} / ${conversations.length} 个会话`}</CardDescription></div>
            <div className="flex flex-wrap items-center gap-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Filter className="size-4" />数据来自最近一次会话同步</div><Button size="sm" variant="outline" onClick={() => syncMutation.mutate()} disabled={!accountId || syncMutation.isPending}><RefreshCw className={syncMutation.isPending ? 'mr-1.5 size-4 animate-spin' : 'mr-1.5 size-4'} />{syncMutation.isPending ? '同步中…' : '同步会话'}</Button></div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_minmax(160px,220px)_minmax(180px,1fr)_minmax(160px,200px)]">
            <div className="space-y-1.5"><Label htmlFor="conversation-search">搜索对端</Label><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="conversation-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="昵称或显示名" className="pl-9" /></div></div>
            <ConversationSelect label="账号" value={accountId ?? ''} onChange={setSelectedAccountId} options={accountsQ.accounts.map((account) => ({ value: account.id, label: account.nickname || '未命名账号' }))} />
            <ConversationSelect label="通道" value={channel} onChange={(value) => setChannel(value as Channel)} options={[{ value: 'all', label: '全部通道' }, { value: 'consumer', label: '消费端' }, { value: 'creator', label: '创作者' }]} />
            <ConversationSelect label="归档" value={archiveFilter} onChange={(value) => setArchiveFilter(value as ArchiveFilter)} options={[{ value: 'active', label: '未归档' }, { value: 'archived', label: '已归档' }, { value: 'all', label: '全部会话' }]} />
          </div>

          {conversationsQ.isLoading ? <Skeleton className="h-64 w-full" /> : conversationsQ.isError ? <ErrorState onRetry={() => void conversationsQ.refetch()} /> : visibleConversations.length ? <ConversationContent items={visibleConversations} onArchive={(conversationId, archived) => archiveMutation.mutate({ conversationId, archived })} onPlatformArchive={(conversationId, archived) => { const conversation = conversations.find((item) => item.id === conversationId); if (!conversation) return; const action = getPlatformArchiveAction(conversation.archived); setPlatformArchiveTarget({ conversation, archived, label: action.label, confirmLabel: action.confirmLabel }) }} pendingConversationId={archiveMutation.isPending ? archiveMutation.variables?.conversationId : undefined} pendingPlatformConversationId={platformArchiveMutation.isPending ? platformArchiveMutation.variables?.conversationId : undefined} /> : <EmptyState hasFilters={!!search || channel !== 'all' || archiveFilter !== 'active'} onReset={() => { setSearch(''); setChannel('all'); setArchiveFilter('active') }} />}
          {conversationsQ.hasNextPage ? <div className="flex justify-center"><Button variant="outline" onClick={() => void conversationsQ.fetchNextPage()} disabled={conversationsQ.isFetchingNextPage}>{conversationsQ.isFetchingNextPage ? '加载中…' : '加载更多会话'}</Button></div> : null}
          <p className="text-xs text-muted-foreground">会话昵称仅用于展示和诊断，不作为自动发送的唯一目标条件；“归档/恢复”只修改产品侧索引，“请求平台…”会创建后台任务，未联调时保持失败关闭。</p>
        </CardContent>
      </Card>
      <ConfirmDialog open={!!platformArchiveTarget} onOpenChange={(open) => { if (!open && !platformArchiveMutation.isPending) setPlatformArchiveTarget(null) }} title={`${platformArchiveTarget?.label ?? '提交平台操作'}？`} description={platformArchiveTarget?.confirmLabel ?? '确认提交这个平台操作吗？'} impact="这会创建后台任务请求抖音平台变更状态，平台最终结果以适配器确认事件为准。" confirmLabel="提交请求" pending={platformArchiveMutation.isPending} onConfirm={() => { if (platformArchiveTarget) platformArchiveMutation.mutate({ conversationId: platformArchiveTarget.conversation.id, archived: platformArchiveTarget.archived }) }} />
    </div>
  )
}

function ConversationContent({ items, onArchive, onPlatformArchive, pendingConversationId, pendingPlatformConversationId }: { items: Conversation[]; onArchive: (conversationId: string, archived: boolean) => void; onPlatformArchive: (conversationId: string, archived: boolean) => void; pendingConversationId?: string; pendingPlatformConversationId?: string }) {
  return <><div className="hidden md:block"><ConversationTable items={items} onArchive={onArchive} onPlatformArchive={onPlatformArchive} pendingConversationId={pendingConversationId} pendingPlatformConversationId={pendingPlatformConversationId} /></div><div className="space-y-3 md:hidden">{items.map((item) => <ConversationCard key={item.id} item={item} onArchive={onArchive} onPlatformArchive={onPlatformArchive} pending={pendingConversationId === item.id} platformPending={pendingPlatformConversationId === item.id} />)}</div></>
}

function ConversationTable({ items, onArchive, onPlatformArchive, pendingConversationId, pendingPlatformConversationId }: { items: Conversation[]; onArchive: (conversationId: string, archived: boolean) => void; onPlatformArchive: (conversationId: string, archived: boolean) => void; pendingConversationId?: string; pendingPlatformConversationId?: string }) {
  return <Table className="min-w-[1040px]"><TableHeader><TableRow><TableHead className="pl-5">对端</TableHead><TableHead>通道</TableHead><TableHead>身份</TableHead><TableHead>最近消息</TableHead><TableHead>最近同步</TableHead><TableHead className="pr-5 text-right">操作</TableHead></TableRow></TableHeader><TableBody>{items.map((item) => <TableRow key={item.id}><TableCell className="pl-5"><ConversationPeer item={item} /></TableCell><TableCell><ChannelBadge channel={item.channel} /></TableCell><TableCell><IdentityBadge status={item.platform_identity_status} /></TableCell><TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDate(item.last_message_at)}</TableCell><TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDate(item.last_synced_at)}</TableCell><TableCell className="pr-5 text-right"><div className="flex justify-end gap-1"><ArchiveButton item={item} onArchive={onArchive} pending={pendingConversationId === item.id} /><PlatformArchiveButton item={item} onPlatformArchive={onPlatformArchive} pending={pendingPlatformConversationId === item.id} /></div></TableCell></TableRow>)}</TableBody></Table>
}

function ConversationCard({ item, onArchive, onPlatformArchive, pending, platformPending }: { item: Conversation; onArchive: (conversationId: string, archived: boolean) => void; onPlatformArchive: (conversationId: string, archived: boolean) => void; pending: boolean; platformPending: boolean }) {
  return <div className="rounded-xl border bg-card p-4"><div className="flex items-start justify-between gap-3"><ConversationPeer item={item} /><ChannelBadge channel={item.channel} /></div><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><div className="text-xs text-muted-foreground">身份</div><div className="mt-1"><IdentityBadge status={item.platform_identity_status} /></div></div><div><div className="text-xs text-muted-foreground">最近消息</div><div className="mt-1 text-muted-foreground">{formatDate(item.last_message_at)}</div></div></div><div className="mt-3 text-xs text-muted-foreground">最近同步 {formatDate(item.last_synced_at)}</div><div className="mt-4 flex flex-wrap justify-end gap-1"><ArchiveButton item={item} onArchive={onArchive} pending={pending} /><PlatformArchiveButton item={item} onPlatformArchive={onPlatformArchive} pending={platformPending} /></div></div>
}

function ArchiveButton({ item, onArchive, pending }: { item: Conversation; onArchive: (conversationId: string, archived: boolean) => void; pending: boolean }) {
  const nextArchived = !item.archived
  return <Button variant="ghost" size="sm" disabled={pending} onClick={() => onArchive(item.id, nextArchived)} aria-label={nextArchived ? '归档会话' : '恢复会话'}>{nextArchived ? <Archive className="mr-1.5 size-4" /> : <ArchiveRestore className="mr-1.5 size-4" />}{pending ? '处理中…' : nextArchived ? '归档' : '恢复'}</Button>
}

function PlatformArchiveButton({ item, onPlatformArchive, pending }: { item: Conversation; onPlatformArchive: (conversationId: string, archived: boolean) => void; pending: boolean }) {
  const action = getPlatformArchiveAction(item.archived)
  return <Button variant="outline" size="sm" disabled={pending} onClick={() => onPlatformArchive(item.id, action.archived)} aria-label={action.label}><CloudCog className="mr-1.5 size-4" />{pending ? '提交中…' : action.label}</Button>
}

function ConversationPeer({ item }: { item: Conversation }) {
  return <div className="flex min-w-[210px] items-center gap-3"><Avatar className="size-9"><AvatarImage src={item.friend_avatar_url ?? undefined} alt="" /><AvatarFallback><Smartphone className="size-4" /></AvatarFallback></Avatar><div className="min-w-0"><div className="truncate font-medium">{item.friend_nickname || item.friend_display_name}</div><div className="mt-0.5 truncate text-xs text-muted-foreground">{item.friend_display_name}</div></div></div>
}

function ChannelBadge({ channel }: { channel: Conversation['channel'] }) { return <Badge variant="secondary">{channel === 'creator' ? '创作者' : '消费端'}</Badge> }

function IdentityBadge({ status }: { status: Conversation['platform_identity_status'] }) { return <Badge variant={status === 'resolved' ? 'success' : status === 'pending' ? 'warning' : 'destructive'}>{status === 'resolved' ? '已解析' : status === 'pending' ? '待解析' : status === 'ambiguous' ? '有歧义' : '缺失'}</Badge> }

function ConversationSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) { const id = `conversation-filter-${label}`; return <SelectField id={id} label={label} value={value} onChange={onChange} options={options} /> }

function SummaryCard({ label, value }: { label: string; value: string | number }) { return <Card><CardContent className="p-5"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 truncate text-xl font-semibold">{value}</div></CardContent></Card> }

function EmptyState({ hasFilters, onReset }: { hasFilters: boolean; onReset: () => void }) { return <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-14 text-center"><MessageCircle className="size-8 text-muted-foreground" /><p className="mt-3 font-medium">{hasFilters ? '没有符合条件的会话' : '还没有会话数据'}</p>{hasFilters ? <Button className="mt-4" variant="outline" onClick={onReset}>清除筛选</Button> : <p className="mt-1 text-sm text-muted-foreground">点击“同步会话”读取账号当前会话。</p>}</div> }

function ErrorState({ onRetry }: { onRetry: () => void }) { return <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-10 text-center"><p className="font-medium">会话列表暂时不可用</p><p className="mt-1 text-sm text-muted-foreground">请稍后重试，或先确认账号已经完成会话同步。</p><Button className="mt-4" variant="outline" onClick={onRetry}>重新加载</Button></div> }

function ConversationsLoading() { return <div className="space-y-6"><Skeleton className="h-20 w-full" /><div className="grid gap-3 sm:grid-cols-4"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div><Skeleton className="h-[420px] w-full" /></div> }

function formatDate(value: string | null | undefined) { return value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '暂无' }
