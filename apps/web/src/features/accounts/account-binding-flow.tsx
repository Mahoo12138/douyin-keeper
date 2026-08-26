import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import {
  cancelJob,
  createAccountBinding,
  myEntitlement,
  streamJobEvents,
  submitSMSVerification,
  type JobEventEnvelope,
} from '@douyin-keeper/sdk-ts'
import { ArrowLeft, ArrowRight, ShieldAlert, Smartphone } from 'lucide-react'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label } from '@douyin-keeper/ui-web'

import { getToken } from '@/auth/session'
import { AccountBindingPanel } from './account-binding-panel'
import type { BindingState } from './account-types'
import { bindingErrorMessage, bindingMethodLabel, isSMSPhoneValid, type BindingMethod } from './account-binding-utils'
import { SelectField } from '@/components/select-field'

type BindingFlowMode = 'embedded' | 'page'

export function AccountBindingFlow({ mode = 'embedded', accountId, onSuccess }: { mode?: BindingFlowMode; accountId?: string; onSuccess?: () => void }) {
  const binding = useAccountBinding(accountId, onSuccess)

  if (mode === 'page') {
    return <><BindingPage binding={binding} />{binding.entitlementDialogOpen && <EntitlementRequiredDialog onClose={binding.closeEntitlementDialog} />}</>
  }

  return (
    <>
      <Button onClick={binding.openChoice} disabled={!!binding.binding}>
        <Smartphone />
        {binding.binding ? '登录进行中…' : accountId ? '重新登录' : '绑定抖音账号'}
      </Button>

      {(binding.bindingChoice || binding.binding) && <BindingDialog binding={binding} onClose={() => {
        if (binding.binding) void binding.cancelBinding()
        else binding.closeChoice()
      }} />}

      {binding.entitlementDialogOpen && <EntitlementRequiredDialog onClose={binding.closeEntitlementDialog} />}
    </>
  )
}

type BindingController = ReturnType<typeof useAccountBinding>

function BindingDialog({ binding, pageMode = false, onClose }: { binding: BindingController; pageMode?: boolean; onClose: () => void }) {
  const activeBinding = binding.binding
  const action = binding.isRebinding ? '重新登录' : '绑定抖音账号'
  const challenge = activeBinding?.status === 'challenge_required'
  const title = activeBinding ? (challenge ? `${action}需要安全验证` : `${bindingMethodLabel(activeBinding.method)}${binding.isRebinding ? '重新登录' : '绑定'}`) : (binding.isRebinding ? '选择重新登录方式' : '选择绑定方式')
  const description = challenge
    ? '请在打开的抖音窗口完成官方安全验证，验证通过后会自动继续。'
    : activeBinding?.status === 'waiting_user' && activeBinding.method === 'sms'
      ? '验证码已发送，请在当前窗口输入验证码完成登录。'
      : activeBinding?.status === 'waiting_user'
        ? '请使用抖音 App 扫描二维码，完成后会自动继续。'
        : activeBinding
          ? '当前登录流程正在安全执行，手机号和验证码只用于本次绑定。'
          : binding.isRebinding
            ? '重新登录会替换当前账号 Session，验证失败时不会改变原有登录态。'
            : '扫码适合快速绑定；短信方式需要输入抖音账号手机号和验证码。'

  return <Dialog open={pageMode || !!binding.bindingChoice || !!activeBinding} onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent className="max-w-2xl">
      <DialogHeader className={challenge ? 'border-amber-500/20 bg-amber-500/[0.06]' : undefined}>
        <div className={`mb-3 flex size-11 items-center justify-center rounded-2xl ${challenge ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300' : 'bg-primary/10 text-primary'}`}>
          {challenge ? <ShieldAlert className="size-5" /> : <Smartphone className="size-5" />}
        </div>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      {activeBinding ? <AccountBindingPanel binding={activeBinding} relogin={binding.isRebinding} submittingCode={binding.submittingCode} onSubmitSMSCode={activeBinding.method === 'sms' ? binding.submitSMSCode : undefined} onCancel={onClose} /> : <BindingMethodForm binding={binding} embedded onCancel={onClose} />}
    </DialogContent>
  </Dialog>
}

function EntitlementRequiredDialog({ onClose }: { onClose: () => void }) {
  return <Dialog open onOpenChange={(open) => { if (!open) onClose() }}><DialogContent><DialogHeader><div className="mb-2 flex size-11 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600"><ShieldAlert className="size-5" /></div><DialogTitle>先激活权益，再添加账号</DialogTitle><DialogDescription>当前权益没有可用的账号配额。兑换卡密或由管理员授权后，就可以继续绑定抖音账号。</DialogDescription></DialogHeader><div className="px-6 py-1"><div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-4 text-sm leading-6 text-muted-foreground">已绑定账号不会受影响；前往权益页可以查看当前使用量、有效期并兑换卡密。</div></div><DialogFooter><Button variant="outline" onClick={onClose}>稍后处理</Button><Button asChild onClick={onClose}><Link to="/entitlement">去权益页<ArrowRight /></Link></Button></DialogFooter></DialogContent></Dialog>
}

function BindingPage({ binding }: { binding: BindingController }) {
  const navigate = useNavigate()
  function close() {
    if (binding.binding) {
      void binding.cancelBinding().finally(() => void navigate({ to: '/accounts' }))
      return
    }
    void navigate({ to: '/accounts' })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon" className="mt-0.5" aria-label="返回账号列表">
          <Link to="/accounts"><ArrowLeft /></Link>
        </Button>
        <div>
          <p className="text-sm font-medium text-primary">账号中心</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">绑定抖音账号</h1>
          <p className="mt-1 text-sm text-muted-foreground">选择一种登录方式完成绑定。绑定成功后将自动开始首次好友同步。</p>
        </div>
      </div>

      <BindingDialog binding={binding} pageMode onClose={close} />
    </div>
  )
}

function BindingMethodForm({ binding, embedded = false, onCancel }: { binding: BindingController; embedded?: boolean; onCancel?: () => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void binding.startBinding()
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="space-y-4 px-6 py-6">
        <SelectField id={embedded ? 'binding-method' : 'binding-page-method'} label={binding.isRebinding ? '登录方式' : '绑定方式'} value={binding.bindingMethod} onChange={(value) => binding.setBindingMethod(value as BindingMethod)} options={[{ value: 'qr', label: bindingMethodLabel('qr') }, { value: 'sms', label: bindingMethodLabel('sms') }]} />
        {binding.bindingMethod === 'sms' && (
          <div className="space-y-1.5">
            <Label htmlFor={embedded ? 'binding-phone' : 'binding-page-phone'}>手机号</Label>
            <Input id={embedded ? 'binding-phone' : 'binding-page-phone'} type="tel" inputMode="tel" autoComplete="tel" value={binding.bindingPhone} onChange={(event) => binding.setBindingPhone(event.target.value)} placeholder="例如 +86 13800138000" />
            <p className="text-xs text-muted-foreground">手机号只用于本次登录流程，不写入账号资料。</p>
          </div>
        )}
      </div>
      <DialogFooter className="-mt-4">
        <div className="flex w-full justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel ?? binding.closeChoice}>取消</Button>
          <Button type="submit">{binding.isRebinding ? '开始重新登录' : '开始绑定'}</Button>
        </div>
      </DialogFooter>
    </form>
  )
}

function useAccountBinding(accountId?: string, onSuccess?: () => void) {
  const token = getToken()
  const queryClient = useQueryClient()
  const entitlementQ = useQuery({ queryKey: ['entitlement'], queryFn: () => myEntitlement(token as string), enabled: !!token && !accountId, staleTime: 30_000 })
  const [binding, setBinding] = useState<BindingState | null>(null)
  const [bindingChoice, setBindingChoice] = useState(false)
  const [entitlementDialogOpen, setEntitlementDialogOpen] = useState(false)
  const [bindingMethod, setBindingMethod] = useState<BindingMethod>('qr')
  const [bindingPhone, setBindingPhone] = useState('')
  const [submittingCode, setSubmittingCode] = useState(false)
  const bindingAbort = useRef<AbortController | null>(null)

  useEffect(() => () => bindingAbort.current?.abort(), [])

  function hasAccountCapacity() {
    if (accountId) return true
    const entitlement = entitlementQ.data
    if (!entitlement) return true
    const accountQuota = entitlement.account_quota ?? Number.POSITIVE_INFINITY
    return entitlement.active && (entitlement.usage?.accounts_used ?? 0) < accountQuota
  }

  function ensureAccountCapacity() {
    if (hasAccountCapacity()) return true
    setEntitlementDialogOpen(true)
    return false
  }

  async function startBinding(method: BindingMethod = bindingMethod) {
    if (!token) return
    if (!ensureAccountCapacity()) return
    const phone = bindingPhone.trim()
    if (method === 'sms' && !isSMSPhoneValid(phone)) {
      toast.error('请输入有效的手机号')
      return
    }
    bindingAbort.current?.abort()
    setBindingChoice(false)
    setBinding({ method, status: 'queued', jobId: null, qr: null, expiresAt: null })
    try {
      const job = await createAccountBinding(token, method, method === 'sms' ? phone : undefined, accountId)
      const controller = new AbortController()
      bindingAbort.current = controller
      setBinding({ method, status: 'running', jobId: job.job_id, qr: null, expiresAt: null })
      void streamJobEvents(token, job.job_id, (event) => handleBindingEvent(event, job.job_id), controller.signal).catch((error) => {
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
    if (event.event_type === 'platform_challenge') {
      setBinding((current) => current?.jobId === jobId ? { ...current, status: 'challenge_required', qr: null } : current)
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
      toast.success(accountId ? '重新登录成功，好友同步已开始' : '抖音账号绑定成功，首次好友同步已开始')
      void queryClient.invalidateQueries({ queryKey: ['accounts'] })
      onSuccess?.()
      return
    }
    if (event.event_type === 'error' || event.event_type === 'challenge_required' || event.event_type === 'cancelled') {
      bindingAbort.current?.abort()
      setBinding((current) => current?.jobId === jobId ? { ...current, status: 'error' } : current)
      const code = typeof event.payload.code === 'string' ? event.payload.code : undefined
      toast.error(bindingErrorMessage(event.event_type, code))
    }
    if (event.event_type === 'sms_code_invalid') toast.error('验证码错误，请重新输入')
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
        const code = typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code?: unknown }).code ?? '')
          : ''
        const message = error instanceof Error ? error.message : ''
        if (code === 'CONFLICT' || message === 'job already finished') {
          setBinding(null)
          void queryClient.invalidateQueries({ queryKey: ['accounts'] })
          toast.info('绑定流程已结束')
          return
        }
        toast.error(error instanceof Error ? error.message : '取消绑定失败')
        return
      }
    }
    setBinding(null)
    toast.info('已取消绑定')
  }

  return {
    isRebinding: !!accountId,
    binding,
    bindingChoice,
    bindingMethod,
    bindingPhone,
    submittingCode,
    openChoice: () => { if (ensureAccountCapacity()) setBindingChoice(true) },
    closeChoice: () => setBindingChoice(false),
    entitlementDialogOpen,
    closeEntitlementDialog: () => setEntitlementDialogOpen(false),
    setBindingMethod,
    setBindingPhone,
    startBinding,
    submitSMSCode,
    cancelBinding,
  }
}
