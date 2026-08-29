import { Avatar, AvatarFallback, AvatarImage, Badge, Switch, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@douyin-keeper/ui-web'
import { CircleHelp, Flame, MessageCircle, Smartphone } from 'lucide-react'

import type { Friend, SparkTask } from './friend-types'
import { formatFriendDate, streakBadgePresentation, TaskStatusBadge } from './friend-status'
import { taskForFriend } from './friend-filters'

export function FriendTable({ friends, tasks, accountId, pendingFriendId, bulkBusy = false, selectedFriendIds = [], onSelectFriend = () => {}, onSelectAll = () => {}, selectionEnabled = false, onToggle }: {
  friends: Friend[]
  tasks: SparkTask[]
  accountId: string | undefined
  pendingFriendId: string | null
  bulkBusy?: boolean
  onToggle: (friend: Friend, enabled: boolean) => void
  selectedFriendIds?: string[]
  onSelectFriend?: (friendId: string, checked: boolean) => void
  onSelectAll?: (checked: boolean) => void
  selectionEnabled?: boolean
}) {
  const selected = new Set(selectedFriendIds)
  const resolvedFriends = friends.filter((friend) => friend.platform_identity_status === 'resolved')
  const allResolvedSelected = resolvedFriends.length > 0 && resolvedFriends.every((friend) => selected.has(friend.id))

  return (
    <Table className="min-w-[720px]">
      <TableHeader>
        <TableRow>
          {selectionEnabled && <TableHead className="w-12 pl-5"><input type="checkbox" checked={allResolvedSelected} disabled={bulkBusy || !resolvedFriends.length} onChange={(event) => onSelectAll(event.target.checked)} aria-label="选择全部可维护会话" /></TableHead>}
          <TableHead className="pl-5">会话</TableHead>
          <TableHead>火花</TableHead>
          <TableHead>任务</TableHead>
          <TableHead>最近发送</TableHead>
          <TableHead className="pr-5 text-right">维护</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {friends.map((friend) => {
          const task = taskForFriend(tasks, accountId, friend.id)
          const streak = streakBadgePresentation(friend.streak_days, friend.streak_activated_today)
          return (
            <TableRow key={friend.id}>
              {selectionEnabled && <TableCell className="pl-5"><input type="checkbox" checked={selected.has(friend.id)} disabled={bulkBusy || friend.platform_identity_status !== 'resolved'} onChange={(event) => onSelectFriend(friend.id, event.target.checked)} aria-label={`选择${friend.nickname || friend.display_name}`} /></TableCell>}
              <TableCell className="pl-5">
                <div className="flex min-w-[210px] items-center gap-3">
                  <Avatar className="size-9">
                    <AvatarImage src={friend.avatar_url ?? undefined} alt="" />
                    <AvatarFallback><Smartphone className="size-4" /></AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{friend.nickname || friend.display_name}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="truncate">{friend.display_name}</span>
                      {friend.short_id && <span>抖音号 {friend.short_id}</span>}
                    </div>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <Badge variant={streak.variant} title={streak.statusLabel} aria-label={`${friend.streak_days} 天，${streak.statusLabel}`}>
                    {streak.state === 'activated' ? <Flame className="mr-1 size-3.5 fill-current" aria-hidden="true" /> : null}
                    {streak.state === 'pending' ? <Flame className="mr-1 size-3.5" aria-hidden="true" /> : null}
                    {streak.state === 'unknown' ? <CircleHelp className="mr-1 size-3.5" aria-hidden="true" /> : null}
                    {friend.streak_days} 天
                  </Badge>
                  {friend.has_conversation && <MessageCircle className="size-4 text-muted-foreground" aria-label="已有会话" />}
                </div>
              </TableCell>
              <TableCell><TaskStatusBadge task={task} /></TableCell>
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatFriendDate(friend.last_sent_at)}</TableCell>
              <TableCell className="pr-5 text-right">
                <Switch
                  checked={friend.spark_enabled}
                  disabled={bulkBusy || pendingFriendId === friend.id || friend.platform_identity_status !== 'resolved'}
                  onCheckedChange={(enabled) => onToggle(friend, enabled)}
                  aria-label={`${friend.nickname || friend.display_name}火花维护`}
                />
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
