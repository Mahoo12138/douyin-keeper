import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  accountCapabilities,
  checkAccountSession,
  deleteAccount,
  pauseAccount,
  resumeAccount,
  syncAccountFriends,
} from '@douyin-keeper/sdk-ts'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Skeleton } from '@douyin-keeper/ui-web'
import { ShieldAlert, Trash2 } from 'lucide-react'

import { getToken } from '@/auth/session'
import { waitForJobEvents } from '@/lib/job-progress'
import { AccountBindingFlow } from './account-binding-flow'
import { AccountList, EmptyAccounts } from './account-list'
import type { Account } from './account-types'
import { CapabilityPanel } from './capability-panel'
import { useAccountsQuery } from './use-accounts-query'

export function AccountsPage() {
  const token = getToken()
  const queryClient = useQueryClient()
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [releaseTarget, setReleaseTarget] = useState<Account | null>(null)

  const accountsQ = useAccountsQuery(token)
  const selectedAccount = accountsQ.accounts.find((account) => account.id === selectedAccountId)
  const capabilitiesQ = useQuery({
    queryKey: ['account-capabilities', selectedAccountId],
    queryFn: () => accountCapabilities(token as string, selectedAccountId as string),
    enabled: !!token && !!selectedAccountId,
  })

  async function runAccountAction(account: Account, action: 'session' | 'friends' | 'pause' | 'resume') {
    if (!token) return
    const key = `${account.id}:${action}`
    setBusyAction(key)
    try {
      if (action === 'pause') {
        await pauseAccount(token, account.id)
        toast.success('账号任务已暂停')
      } else if (action === 'resume') {
        await resumeAccount(token, account.id)
        toast.success('账号任务已恢复')
      } else {
        const job = action === 'session' ? await checkAccountSession(token, account.id) : await syncAccountFriends(token, account.id)
        toast.success(action === 'session' ? '会话检查已开始' : '好友同步已开始')
        await waitForJobEvents(token, job.job_id)
      }
      await queryClient.invalidateQueries({ queryKey: ['accounts'] })
      if (selectedAccountId === account.id) {
        await queryClient.invalidateQueries({ queryKey: ['account-capabilities', account.id] })
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '任务执行失败')
    } finally {
      setBusyAction(null)
    }
  }

  async function releaseAccount() {
    if (!token || !releaseTarget) return
    const account = releaseTarget
    const key = `${account.id}:release`
    setBusyAction(key)
    try {
      await deleteAccount(token, account.id)
      setSelectedAccountId(null)
      await queryClient.invalidateQueries({ queryKey: ['accounts'] })
      setReleaseTarget(null)
      toast.success('账号已解除绑定')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '解除绑定失败')
    } finally {
      setBusyAction(null)
    }
  }

  const accounts = accountsQ.accounts
  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-primary">账号中心</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">抖音账号</h1>
          <p className="mt-1 text-sm text-muted-foreground">管理登录状态、能力快照与好友同步。</p>
        </div>
        <AccountBindingFlow />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>已绑定账号</CardTitle>
          <CardDescription>{accounts.length ? `共 ${accounts.length} 个账号` : '还没有绑定抖音账号'}</CardDescription>
        </CardHeader>
        <CardContent>
          {accountsQ.isLoading ? (
            <div className="space-y-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
          ) : accounts.length === 0 ? (
            <EmptyAccounts />
          ) : (
            <>
              <AccountList
                accounts={accounts}
                selectedAccountId={selectedAccountId}
                busyAction={busyAction}
                onSelect={(accountId) => setSelectedAccountId((current) => current === accountId ? null : accountId)}
                onSession={(account) => void runAccountAction(account, 'session')}
                onFriends={(account) => void runAccountAction(account, 'friends')}
                onPause={(account) => void runAccountAction(account, account.paused_at ? 'resume' : 'pause')}
                onRelease={(account) => setReleaseTarget(account)}
              />
              {accountsQ.hasNextPage && <div className="mt-4 flex justify-center"><Button variant="outline" onClick={() => void accountsQ.fetchNextPage()} disabled={accountsQ.isFetchingNextPage}>{accountsQ.isFetchingNextPage ? '加载中…' : '加载更多账号'}</Button></div>}
            </>
          )}
        </CardContent>
      </Card>

      {selectedAccount && <CapabilityPanel account={selectedAccount} capabilities={capabilitiesQ.data?.items ?? []} loading={capabilitiesQ.isLoading} error={capabilitiesQ.isError} />}

      <ReleaseAccountDialog
        account={releaseTarget}
        pending={busyAction === `${releaseTarget?.id}:release`}
        onOpenChange={(open) => {
          if (!open && busyAction !== `${releaseTarget?.id}:release`) setReleaseTarget(null)
        }}
        onConfirm={() => void releaseAccount()}
      />
    </div>
  )
}

function ReleaseAccountDialog({ account, pending, onOpenChange, onConfirm }: {
  account: Account | null
  pending: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={!!account} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-2 flex size-11 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <ShieldAlert className="size-5" />
          </div>
          <DialogTitle>解除抖音账号绑定？</DialogTitle>
          <DialogDescription>
            将解除“{account?.nickname || '未命名账号'}”的绑定，并撤销当前会话。
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 py-5">
          <div className="rounded-xl border border-destructive/20 bg-destructive/[0.06] p-4 text-sm leading-6 text-muted-foreground">
            未执行的任务会被取消，好友与火花任务不会继续使用这个账号。此操作不会影响你的抖音账号本身。
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>保留账号</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            <Trash2 />
            {pending ? '解除中…' : '确认解除绑定'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
