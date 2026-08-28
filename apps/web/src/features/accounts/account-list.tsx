import { Link } from '@tanstack/react-router'
import { Avatar, AvatarFallback, AvatarImage, Button } from '@douyin-keeper/ui-web'
import { ArrowRight, MessageCircle, Pause, Play, RefreshCw, Smartphone, Trash2 } from 'lucide-react'

import type { Account } from './account-types'
import { bindingLabel, formatDate, riskLabel, sessionLabel, StatusBadge } from './account-status'
import { canSyncFriends } from './account-detail-utils'
import { AccountBindingFlow } from './account-binding-flow'

export function AccountList({ accounts, selectedAccountId, busyAction, onSelect, onSession, onConversations, onPause, onRelease }: {
  accounts: Account[]
  selectedAccountId: string | null
  busyAction: string | null
  onSelect: (accountId: string) => void
  onSession: (account: Account) => void
  onConversations: (account: Account) => void
  onPause: (account: Account) => void
  onRelease: (account: Account) => void
}) {
  return (
    <div className="space-y-3">
      {accounts.map((account) => (
        <AccountRow
          key={account.id}
          account={account}
          selected={account.id === selectedAccountId}
          busyAction={busyAction}
          onSelect={() => onSelect(account.id)}
          onSession={() => onSession(account)}
          onConversations={() => onConversations(account)}
          onPause={() => onPause(account)}
          onRelease={() => onRelease(account)}
        />
      ))}
    </div>
  )
}

function AccountRow({ account, selected, busyAction, onSelect, onSession, onConversations, onPause, onRelease }: {
  account: Account
  selected: boolean
  busyAction: string | null
  onSelect: () => void
  onSession: () => void
  onConversations: () => void
  onPause: () => void
  onRelease: () => void
}) {
  return (
    <div className={`rounded-xl border p-4 transition-colors ${selected ? 'border-primary/40 bg-primary/[0.03]' : 'border-border'}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <button className="flex min-w-0 items-center gap-3 text-left" onClick={onSelect} aria-expanded={selected}>
          <Avatar className="size-11">
            <AvatarImage src={account.avatar_url ?? undefined} alt="" />
            <AvatarFallback><Smartphone className="size-4" /></AvatarFallback>
          </Avatar>
          <span className="min-w-0">
            <span className="block truncate font-medium">{account.nickname || '未命名账号'}</span>
            <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <StatusBadge label={bindingLabel(account.binding_status)} variant={account.binding_status === 'bound' ? 'success' : 'muted'} />
              <StatusBadge label={sessionLabel(account.session_status)} variant={account.session_status === 'valid' ? 'success' : account.session_status === 'expired' ? 'destructive' : 'warning'} />
              <StatusBadge label={riskLabel(account.risk_status)} variant={account.risk_status === 'normal' ? 'success' : account.risk_status === 'paused' ? 'destructive' : 'warning'} />
            </span>
            <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>会话 {account.friend_count}</span>
              <span>启用任务 {account.enabled_task_count}</span>
              <span>今日成功 {account.today_send_succeeded}</span>
              <span>失败 {account.today_send_failed}</span>
              <span>检查 {formatDate(account.last_session_check_at)}</span>
            </span>
          </span>
        </button>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button asChild variant="ghost" size="sm"><Link to="/accounts/$accountId" params={{ accountId: account.id }}>详情<ArrowRight /></Link></Button>
          {account.binding_status === 'bound' && <AccountBindingFlow accountId={account.id} />}
          <Button variant="outline" size="sm" onClick={onSession} disabled={busyAction !== null}>
            <RefreshCw />
            会话检查
          </Button>
          <Button variant="outline" size="sm" onClick={onConversations} disabled={busyAction !== null || !canSyncFriends(account)} title={!canSyncFriends(account) ? '请重新登录后再同步会话' : undefined}>
            <MessageCircle />
            同步会话
          </Button>
          <Button variant="outline" size="sm" onClick={onPause} disabled={busyAction !== null}>
            {account.paused_at ? <Play /> : <Pause />}
            {account.paused_at ? '恢复任务' : '暂停任务'}
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={onRelease} disabled={busyAction !== null}>
            <Trash2 />
            解除绑定
          </Button>
        </div>
      </div>
      {selected && (
        <div className="mt-4 border-t pt-4 text-xs text-muted-foreground">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <span>上次会话检查：{formatDate(account.last_session_check_at)}</span>
            <span>上次会话同步：{formatDate(account.last_friend_sync_at)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export function EmptyAccounts() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center">
      <div className="flex size-11 items-center justify-center rounded-full bg-muted"><Smartphone className="size-5 text-muted-foreground" /></div>
      <div className="mt-3 font-medium">还没有抖音账号</div>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">绑定后可检查登录状态、同步消息会话并维护火花任务。</p>
      <Button asChild className="mt-4" variant="outline"><Link to="/accounts/new">开始绑定</Link></Button>
    </div>
  )
}
