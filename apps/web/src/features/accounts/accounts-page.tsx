import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  accountCapabilities,
  cancelJob,
  checkAccountSession,
  createAccountBinding,
  getJob,
  listAccounts,
  streamJobEvents,
  submitSMSVerification,
  syncAccountFriends,
  type JobEventEnvelope,
} from '@douyin-keeper/sdk-ts'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Skeleton } from '@douyin-keeper/ui-web'
import { Smartphone } from 'lucide-react'

import { getToken } from '@/auth/session'
import { AccountBindingPanel } from './account-binding-panel'
import { AccountList, EmptyAccounts } from './account-list'
import type { Account, BindingState } from './account-types'
import { CapabilityPanel } from './capability-panel'

export function AccountsPage() {
  const token = getToken()
  const queryClient = useQueryClient()
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [binding, setBinding] = useState<BindingState | null>(null)
  const [bindingChoice, setBindingChoice] = useState(false)
  const [bindingMethod, setBindingMethod] = useState<'qr' | 'sms'>('qr')
  const [bindingPhone, setBindingPhone] = useState('')
  const [submittingCode, setSubmittingCode] = useState(false)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const bindingAbort = useRef<AbortController | null>(null)

  const accountsQ = useQuery({
    queryKey: ['accounts'],
    queryFn: () => listAccounts(token as string),
    enabled: !!token,
  })
  const selectedAccount = accountsQ.data?.items.find((account) => account.id === selectedAccountId)
  const capabilitiesQ = useQuery({
    queryKey: ['account-capabilities', selectedAccountId],
    queryFn: () => accountCapabilities(token as string, selectedAccountId as string),
    enabled: !!token && !!selectedAccountId,
  })

  useEffect(() => () => bindingAbort.current?.abort(), [])

  async function startBinding(method: 'qr' | 'sms' = bindingMethod) {
    if (!token) return
    const phone = bindingPhone.trim()
    if (method === 'sms' && !/^\+?[0-9][0-9 ()-]{3,30}$/.test(phone)) {
      toast.error('请输入有效的手机号')
      return
    }
    bindingAbort.current?.abort()
    setBindingChoice(false)
    setBinding({ method, status: 'queued', jobId: null, qr: null, expiresAt: null })
    try {
      const job = await createAccountBinding(token, method, method === 'sms' ? phone : undefined)
      const controller = new AbortController()
      bindingAbort.current = controller
      setBinding({ method, status: 'running', jobId: job.job_id, qr: null, expiresAt: null })
      void streamJobEvents(token, job.job_id, (event) => {
        handleBindingEvent(event, job.job_id)
      }, controller.signal).catch((error) => {
        if (controller.signal.aborted) return
        setBinding((current) => current?.jobId === job.job_id ? { ...current, status: 'error' } : current)
        toast.error(error instanceof Error ? error.message : '绑定进度读取失败')
      })
    } catch (error) {
      setBinding(null)
      toast.error(error instanceof Error ? error.message : '创建绑定任务失败')
    }
  }

  function handleBindingEvent(event: JobEventEnvelope, jobId: string) {
    if (event.event_type === 'qr_ready') {
      const value = event.payload.value
      const format = event.payload.format
      const expiresAt = event.payload.expires_at
      if (format === 'data_url' && typeof value === 'string') {
        setBinding((current) => current?.jobId === jobId ? { ...current, status: 'waiting_user', qr: value, expiresAt: typeof expiresAt === 'string' ? expiresAt : null } : current)
      }
      return
    }
    if (event.event_type === 'sms_code_required') {
      const expiresAt = event.payload.expires_at
      setBinding((current) => current?.jobId === jobId ? { ...current, status: 'waiting_user', qr: null, expiresAt: typeof expiresAt === 'string' ? expiresAt : null } : current)
      return
    }
    if (event.event_type === 'scanned' || event.event_type === 'confirming') {
      const status: BindingState['status'] = event.event_type === 'scanned' ? 'scanned' : 'confirming'
      setBinding((current) => current?.jobId === jobId ? { ...current, status } : current)
      return
    }
    if (event.event_type === 'success') {
      bindingAbort.current?.abort()
      setBinding(null)
      toast.success('抖音账号绑定成功')
      void queryClient.invalidateQueries({ queryKey: ['accounts'] })
      return
    }
    if (event.event_type === 'error' || event.event_type === 'challenge_required' || event.event_type === 'cancelled') {
      bindingAbort.current?.abort()
      setBinding((current) => current?.jobId === jobId ? { ...current, status: 'error' } : current)
      toast.error(event.event_type === 'challenge_required' ? '需要完成平台安全验证' : '账号绑定未完成')
    }
    if (event.event_type === 'sms_code_invalid') {
      toast.error('验证码错误，请重新输入')
    }
  }

  async function submitSMSCode(code: string) {
    if (!token || !binding?.jobId) return
    setSubmittingCode(true)
    try {
      await submitSMSVerification(token, binding.jobId, code)
      toast.success('验证码已提交，正在验证')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '验证码提交失败')
    } finally {
      setSubmittingCode(false)
    }
  }

  async function cancelBinding() {
    const activeBinding = binding
    bindingAbort.current?.abort()
    if (token && activeBinding?.jobId) {
      try {
        await cancelJob(token, activeBinding.jobId)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '取消绑定失败')
        return
      }
    }
    setBinding(null)
    toast.info('已取消绑定')
  }

  async function runAccountAction(account: Account, action: 'session' | 'friends') {
    if (!token) return
    const key = `${account.id}:${action}`
    setBusyAction(key)
    try {
      const job = action === 'session' ? await checkAccountSession(token, account.id) : await syncAccountFriends(token, account.id)
      toast.success(action === 'session' ? '会话检查已开始' : '好友同步已开始')
      await waitForJob(token, job.job_id)
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

  const accounts = accountsQ.data?.items ?? []
  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-primary">账号中心</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">抖音账号</h1>
          <p className="mt-1 text-sm text-muted-foreground">管理登录状态、能力快照与好友同步。</p>
        </div>
        <Button onClick={() => setBindingChoice(true)} disabled={!!binding}>
          <Smartphone />
          {binding ? '绑定进行中…' : '绑定抖音账号'}
        </Button>
      </div>

      {bindingChoice && !binding && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" role="presentation">
          <Card role="dialog" aria-modal="true" aria-labelledby="binding-choice-title" className="w-full max-w-md shadow-2xl">
            <CardHeader><CardTitle id="binding-choice-title">选择绑定方式</CardTitle><CardDescription>扫码适合快速绑定；短信方式需要输入抖音账号手机号和验证码。</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5"><Label htmlFor="binding-method">绑定方式</Label><select id="binding-method" value={bindingMethod} onChange={(event) => setBindingMethod(event.target.value as 'qr' | 'sms')} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"><option value="qr">扫码登录</option><option value="sms">短信验证码登录</option></select></div>
              {bindingMethod === 'sms' && <div className="space-y-1.5"><Label htmlFor="binding-phone">手机号</Label><Input id="binding-phone" type="tel" inputMode="tel" autoComplete="tel" value={bindingPhone} onChange={(event) => setBindingPhone(event.target.value)} placeholder="例如 +86 13800138000" /><p className="text-xs text-muted-foreground">手机号只用于本次登录流程，不写入账号资料。</p></div>}
              <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setBindingChoice(false)}>取消</Button><Button onClick={() => void startBinding()}>开始绑定</Button></div>
            </CardContent>
          </Card>
        </div>
      )}

      {binding && <AccountBindingPanel binding={binding} submittingCode={submittingCode} onSubmitSMSCode={binding.method === 'sms' ? submitSMSCode : undefined} onCancel={() => void cancelBinding()} />}

      <Card>
        <CardHeader>
          <CardTitle>已绑定账号</CardTitle>
          <CardDescription>{accounts.length ? `共 ${accounts.length} 个账号` : '还没有绑定抖音账号'}</CardDescription>
        </CardHeader>
        <CardContent>
          {accountsQ.isLoading ? (
            <div className="space-y-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
          ) : accounts.length === 0 ? (
            <EmptyAccounts onBind={() => void startBinding()} />
          ) : (
            <AccountList
              accounts={accounts}
              selectedAccountId={selectedAccountId}
              busyAction={busyAction}
              onSelect={(accountId) => setSelectedAccountId((current) => current === accountId ? null : accountId)}
              onSession={(account) => void runAccountAction(account, 'session')}
              onFriends={(account) => void runAccountAction(account, 'friends')}
            />
          )}
        </CardContent>
      </Card>

      {selectedAccount && <CapabilityPanel account={selectedAccount} capabilities={capabilitiesQ.data?.items ?? []} loading={capabilitiesQ.isLoading} error={capabilitiesQ.isError} />}
    </div>
  )
}

async function waitForJob(token: string, jobId: string) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const job = await getJob(token, jobId)
    if (job.status === 'succeeded') return
    if (job.status === 'failed' || job.status === 'cancelled') throw new Error(job.error_code ?? '任务未完成')
    await new Promise((resolve) => window.setTimeout(resolve, 1000))
  }
  throw new Error('任务执行超时，请稍后刷新状态')
}
