import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { listAccounts, listConversations, type components } from '@douyin-keeper/sdk-ts'
import { Avatar, AvatarFallback, AvatarImage, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@douyin-keeper/ui-web'
import { Filter, MessageCircle, Search, Smartphone } from 'lucide-react'

import { getToken } from '@/auth/session'

type Conversation = components['schemas']['Conversation']
type Channel = Conversation['channel'] | 'all'

export function ConversationsPage() {
  const token = getToken()
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>()
  const [search, setSearch] = useState('')
  const [channel, setChannel] = useState<Channel>('all')

  const accountsQ = useQuery({
    queryKey: ['accounts'],
    queryFn: () => listAccounts(token as string),
    enabled: !!token,
  })
  const accountId = selectedAccountId ?? accountsQ.data?.items[0]?.id
  const selectedAccount = accountsQ.data?.items.find((account) => account.id === accountId)
  const conversationsQ = useQuery({
    queryKey: ['conversations', accountId],
    queryFn: () => listConversations(token as string, accountId as string, { limit: 100 }),
    enabled: !!token && !!accountId,
  })

  const conversations = conversationsQ.data?.items ?? []
  const visibleConversations = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('zh-CN')
    return conversations.filter((item) => {
      const matchesChannel = channel === 'all' || item.channel === channel
      const matchesSearch = !query || [item.friend_display_name, item.friend_nickname].some((value) => value.toLocaleLowerCase('zh-CN').includes(query))
      return matchesChannel && matchesSearch
    })
  }, [channel, conversations, search])
  const consumerCount = conversations.filter((item) => item.channel === 'consumer').length
  const creatorCount = conversations.filter((item) => item.channel === 'creator').length

  if (accountsQ.isLoading) return <ConversationsLoading />

  if (!accountsQ.data?.items.length) {
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
        <p className="mt-1 text-sm text-muted-foreground">只展示已同步的真实会话，发送目标仍由平台身份和会话 ID 驱动。</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="当前账号" value={selectedAccount?.nickname || '未命名账号'} />
        <SummaryCard label="消费端会话" value={consumerCount} />
        <SummaryCard label="创作者会话" value={creatorCount} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div><CardTitle>已建立会话</CardTitle><CardDescription>{visibleConversations.length === conversations.length ? `共 ${conversations.length} 个会话` : `筛选出 ${visibleConversations.length} / ${conversations.length} 个会话`}</CardDescription></div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Filter className="size-4" />数据来自最近一次好友同步</div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_minmax(160px,220px)_minmax(180px,1fr)]">
            <div className="space-y-1.5"><Label htmlFor="conversation-search">搜索对端</Label><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="conversation-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="昵称或显示名" className="pl-9" /></div></div>
            <ConversationSelect label="账号" value={accountId ?? ''} onChange={setSelectedAccountId} options={accountsQ.data.items.map((account) => ({ value: account.id, label: account.nickname || '未命名账号' }))} />
            <ConversationSelect label="通道" value={channel} onChange={(value) => setChannel(value as Channel)} options={[{ value: 'all', label: '全部通道' }, { value: 'consumer', label: '消费端' }, { value: 'creator', label: '创作者' }]} />
          </div>

          {conversationsQ.isLoading ? <Skeleton className="h-64 w-full" /> : conversationsQ.isError ? <ErrorState onRetry={() => void conversationsQ.refetch()} /> : visibleConversations.length ? <ConversationContent items={visibleConversations} /> : <EmptyState hasFilters={!!search || channel !== 'all'} onReset={() => { setSearch(''); setChannel('all') }} />}
          <p className="text-xs text-muted-foreground">会话昵称仅用于展示和诊断，不作为自动发送的唯一目标条件。</p>
        </CardContent>
      </Card>
    </div>
  )
}

function ConversationContent({ items }: { items: Conversation[] }) {
  return <><div className="hidden md:block"><ConversationTable items={items} /></div><div className="space-y-3 md:hidden">{items.map((item) => <ConversationCard key={item.id} item={item} />)}</div></>
}

function ConversationTable({ items }: { items: Conversation[] }) {
  return <Table className="min-w-[760px]"><TableHeader><TableRow><TableHead className="pl-5">对端</TableHead><TableHead>通道</TableHead><TableHead>身份</TableHead><TableHead>最近消息</TableHead><TableHead className="pr-5 text-right">最近同步</TableHead></TableRow></TableHeader><TableBody>{items.map((item) => <TableRow key={item.id}><TableCell className="pl-5"><ConversationPeer item={item} /></TableCell><TableCell><ChannelBadge channel={item.channel} /></TableCell><TableCell><IdentityBadge status={item.platform_identity_status} /></TableCell><TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDate(item.last_message_at)}</TableCell><TableCell className="pr-5 text-right whitespace-nowrap text-sm text-muted-foreground">{formatDate(item.last_synced_at)}</TableCell></TableRow>)}</TableBody></Table>
}

function ConversationCard({ item }: { item: Conversation }) {
  return <div className="rounded-xl border bg-card p-4"><div className="flex items-start justify-between gap-3"><ConversationPeer item={item} /><ChannelBadge channel={item.channel} /></div><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><div className="text-xs text-muted-foreground">身份</div><div className="mt-1"><IdentityBadge status={item.platform_identity_status} /></div></div><div><div className="text-xs text-muted-foreground">最近消息</div><div className="mt-1 text-muted-foreground">{formatDate(item.last_message_at)}</div></div></div><div className="mt-3 text-xs text-muted-foreground">最近同步 {formatDate(item.last_synced_at)}</div></div>
}

function ConversationPeer({ item }: { item: Conversation }) {
  return <div className="flex min-w-[210px] items-center gap-3"><Avatar className="size-9"><AvatarImage src={item.friend_avatar_url ?? undefined} alt="" /><AvatarFallback><Smartphone className="size-4" /></AvatarFallback></Avatar><div className="min-w-0"><div className="truncate font-medium">{item.friend_nickname || item.friend_display_name}</div><div className="mt-0.5 truncate text-xs text-muted-foreground">{item.friend_display_name}</div></div></div>
}

function ChannelBadge({ channel }: { channel: Conversation['channel'] }) { return <Badge variant="secondary">{channel === 'creator' ? '创作者' : '消费端'}</Badge> }

function IdentityBadge({ status }: { status: Conversation['platform_identity_status'] }) { return <Badge variant={status === 'resolved' ? 'success' : status === 'pending' ? 'warning' : 'destructive'}>{status === 'resolved' ? '已解析' : status === 'pending' ? '待解析' : status === 'ambiguous' ? '有歧义' : '缺失'}</Badge> }

function ConversationSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) { const id = `conversation-filter-${label}`; return <div className="space-y-1.5"><Label htmlFor={id}>{label}</Label><select id={id} value={value} onChange={(event) => onChange(event.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div> }

function SummaryCard({ label, value }: { label: string; value: string | number }) { return <Card><CardContent className="p-5"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 truncate text-xl font-semibold">{value}</div></CardContent></Card> }

function EmptyState({ hasFilters, onReset }: { hasFilters: boolean; onReset: () => void }) { return <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-14 text-center"><MessageCircle className="size-8 text-muted-foreground" /><p className="mt-3 font-medium">{hasFilters ? '没有符合条件的会话' : '还没有会话数据'}</p>{hasFilters ? <Button className="mt-4" variant="outline" onClick={onReset}>清除筛选</Button> : <p className="mt-1 text-sm text-muted-foreground">先到「好友与火花」页同步好友。</p>}</div> }

function ErrorState({ onRetry }: { onRetry: () => void }) { return <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-10 text-center"><p className="font-medium">会话列表暂时不可用</p><p className="mt-1 text-sm text-muted-foreground">请稍后重试，或先确认账号已经完成好友同步。</p><Button className="mt-4" variant="outline" onClick={onRetry}>重新加载</Button></div> }

function ConversationsLoading() { return <div className="space-y-6"><Skeleton className="h-20 w-full" /><div className="grid gap-3 sm:grid-cols-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div><Skeleton className="h-[420px] w-full" /></div> }

function formatDate(value: string | null | undefined) { return value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '暂无' }
