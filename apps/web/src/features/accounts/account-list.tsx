import { Avatar, AvatarFallback, AvatarImage, Button } from '@douyin-keeper/ui-web'
import { RefreshCw, Smartphone, UsersRound } from 'lucide-react'

import type { Account } from './account-types'
import { bindingLabel, formatDate, riskLabel, sessionLabel, StatusBadge } from './account-status'

export function AccountList({ accounts, selectedAccountId, busyAction, onSelect, onSession, onFriends }: {
  accounts: Account[]
  selectedAccountId: string | null
  busyAction: string | null
  onSelect: (accountId: string) => void
  onSession: (account: Account) => void
  onFriends: (account: Account) => void
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
          onFriends={() => onFriends(account)}
        />
      ))}
    </div>
  )
}

function AccountRow({ account, selected, busyAction, onSelect, onSession, onFriends }: {
  account: Account
  selected: boolean
  busyAction: string | null
  onSelect: () => void
  onSession: () => void
  onFriends: () => void
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
              {account.risk_status !== 'normal' && <StatusBadge label={riskLabel(account.risk_status)} variant="warning" />}
            </span>
          </span>
        </button>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button variant="outline" size="sm" onClick={onSession} disabled={busyAction !== null}>
            <RefreshCw />
            会话检查
          </Button>
          <Button variant="outline" size="sm" onClick={onFriends} disabled={busyAction !== null}>
            <UsersRound />
            同步好友
          </Button>
        </div>
      </div>
      {selected && (
        <div className="mt-4 border-t pt-4 text-xs text-muted-foreground">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <span>上次会话检查：{formatDate(account.last_session_check_at)}</span>
            <span>上次好友同步：{formatDate(account.last_friend_sync_at)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export function EmptyAccounts({ onBind }: { onBind: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center">
      <div className="flex size-11 items-center justify-center rounded-full bg-muted"><Smartphone className="size-5 text-muted-foreground" /></div>
      <div className="mt-3 font-medium">还没有抖音账号</div>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">绑定后可检查登录状态、同步好友并维护火花任务。</p>
      <Button className="mt-4" variant="outline" onClick={onBind}>开始绑定</Button>
    </div>
  )
}
