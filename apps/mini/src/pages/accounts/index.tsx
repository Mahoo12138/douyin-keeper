import { useCallback, useEffect, useState } from 'react'
import { Image, Input, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'

import { accountCapabilities, cancelJob, checkAccountSession, createAccountBinding, deleteAccount, getJob, listAccounts, listFriends, MiniApiError, myEntitlement, pauseAccount, resumeAccount, streamJobEvents, submitSMSVerification, syncAccountFriends } from '@/lib/api'
import type { JobEvent } from '@/lib/api'
import { clearPendingBinding, getAccessToken, getPendingBinding, setPendingBinding } from '@/lib/session'
import { bindingEventState } from '@/features/accounts/binding-events'
import { effectiveCapabilities } from '@/features/accounts/capability-utils'
import { accountBindingError } from '@/features/accounts/account-error-utils'
import { createIdempotencyKey } from '@/features/home/home-utils'
import { jobErrorMessage } from '@/features/job-error-utils'
import { openLoginPage, openMeEntitlement } from '@/features/navigation/mini-navigation'
import { accountTabLabel } from '@/components/account-tab-utils'
import { MiniButton as Button } from '@/components/mini-button'
import { MiniNavbarAction, MiniPageLayout } from '@/components/mini-navbar'
import { MiniRemoteImage } from '@/components/mini-remote-image'

type Account = Awaited<ReturnType<typeof listAccounts>>['items'][number]
type Screen = 'list' | 'detail' | 'intro' | 'method' | 'qr' | 'progress' | 'success'
type BindingMethod = 'qr' | 'sms'
type AccountJobAction = 'session' | 'friends'
type AccountJob = { id: string; action: AccountJobAction }

export default function Accounts() {
  const [state, setState] = useState<'loading' | 'guest' | 'ready' | 'error'>('loading')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [conversationCounts, setConversationCounts] = useState<Record<string, number>>({})
  const [accountQuota, setAccountQuota] = useState<number | null>(null)
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [screen, setScreen] = useState<Screen>('list')
  const [menuOpen, setMenuOpen] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [bindingMethod, setBindingMethod] = useState<BindingMethod>('qr')
  const [bindingPhone, setBindingPhone] = useState('')
  const [bindingJobId, setBindingJobId] = useState('')
  const [bindingStatus, setBindingStatus] = useState('')
  const [bindingAccountId, setBindingAccountId] = useState('')
  const [bindingStep, setBindingStep] = useState(1)
  const [qrValue, setQrValue] = useState('')
  const [qrExpiresAt, setQrExpiresAt] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const [successAccount, setSuccessAccount] = useState<Account | null>(null)
  const [accountJob, setAccountJob] = useState<AccountJob | null>(null)
  const [accountJobAction, setAccountJobAction] = useState<AccountJobAction | ''>('')
  const [accountJobStatus, setAccountJobStatus] = useState('')

  const load = useCallback(async () => {
    const token = getAccessToken()
    if (!token) {
      setState('guest')
      return
    }
    setState('loading')
    setError('')
    try {
      const [accountResponse, entitlementResponse] = await Promise.all([
        listAccounts(token),
        myEntitlement(token).catch(() => null),
      ])
      const conversationResults = await Promise.all(accountResponse.items.map(async (account) => {
        try {
          return [account.id, (await listFriends(token, account.id)).items.length] as const
        } catch {
          return null
        }
      }))
      setAccounts(accountResponse.items)
      setConversationCounts(Object.fromEntries(conversationResults.filter((item): item is readonly [string, number] => item !== null)))
      setAccountQuota(entitlementResponse?.account_quota ?? null)
      setState('ready')
      return accountResponse.items
    } catch (cause) {
      if (cause instanceof MiniApiError && cause.statusCode === 401) {
        openLoginPage()
        setState('guest')
        return
      }
      setError(cause instanceof Error ? cause.message : '账号列表加载失败')
      setState('error')
    }
  }, [])

  useDidShow(() => {
    if (getAccessToken()) void Taro.showTabBar({ animation: false })
    const pending = getPendingBinding()
    if (pending) {
      setBindingJobId(pending.job_id)
      setBindingMethod(pending.method)
      setBindingAccountId(pending.account_id ?? '')
      setBindingStep(3)
      setBindingStatus('正在恢复绑定任务，请稍候')
      setScreen(pending.method === 'qr' ? 'qr' : 'progress')
    }
    void load()
  })

  useEffect(() => {
    if (!bindingJobId) return
    const token = getAccessToken()
    if (!token) return
    let active = true
    const poll = async () => {
      try {
        const job = await getJob(token, bindingJobId)
        if (!active) return
        setBindingStatus(jobStatusLabel(job.status))
        if (job.status === 'succeeded') {
          clearPendingBinding()
          setBindingJobId('')
          setBindingStatus('绑定成功，正在刷新账号')
          const freshAccounts = await load()
          if (active) {
            const account = bindingAccountId ? freshAccounts?.find((item) => item.id === bindingAccountId) : freshAccounts?.[freshAccounts.length - 1]
            setSuccessAccount(account ?? null)
            setBindingAccountId('')
            setBindingStep(5)
            setScreen('success')
          }
        } else if (job.status === 'failed' || job.status === 'cancelled') {
          clearPendingBinding()
          setBindingJobId('')
          setBindingStatus('')
          if (active) {
            await load()
            if (active) {
              setError(jobErrorMessage(job.error_code, job.status === 'cancelled' ? '绑定任务已取消，请重新开始。' : '绑定任务未完成，请重试。'))
              setScreen('method')
            }
          }
        }
      } catch (cause) {
        if (!active) return
        if (redirectOnAuthExpired(cause)) return
        if (cause instanceof MiniApiError && cause.statusCode === 404) {
          clearPendingBinding()
          setBindingJobId('')
          setBindingStatus('')
          setError('绑定任务已失效，请重新开始。')
          setScreen('method')
          return
        }
        setError(cause instanceof Error ? cause.message : '绑定状态查询失败')
      }
    }
    void poll()
    const timer = setInterval(() => void poll(), 2500)
    return () => { active = false; clearInterval(timer) }
  }, [bindingJobId, load])

  useEffect(() => {
    if (!bindingJobId || !['qr', 'progress'].includes(screen)) return
    const token = getAccessToken()
    if (!token) return
    let active = true
    const stream = streamJobEvents(token, bindingJobId, (event: JobEvent) => {
      if (!active) return
      handleBindingEvent(event)
    })
    return () => { active = false; stream.abort() }
  }, [bindingJobId, screen])

  useEffect(() => {
    if (!accountJob) return
    const token = getAccessToken()
    if (!token) {
      setAccountJob(null)
      setAccountJobAction('')
      setAccountJobStatus('')
      setBusy('')
      return
    }
    let active = true
    const poll = async () => {
      try {
        const job = await getJob(token, accountJob.id)
        if (!active) return
        setAccountJobStatus(jobStatusLabel(job.status))
        if (!['succeeded', 'failed', 'cancelled'].includes(job.status)) return
        setAccountJob(null)
        setBusy('')
        if (job.status === 'succeeded') {
          await load()
          if (active) await Taro.showToast({ title: accountJob.action === 'friends' ? '会话同步完成' : '登录态检查完成', icon: 'success' })
        } else if (active) {
          setError(jobErrorMessage(job.error_code, accountJob.action === 'friends' ? '会话同步失败，请重试。' : '登录态检查失败，请重试。'))
        }
      } catch (cause) {
        if (!active) return
        if (redirectOnAuthExpired(cause)) return
        setAccountJob(null)
        setAccountJobStatus('')
        setBusy('')
        setError(cause instanceof Error ? cause.message : '后台任务状态查询失败')
      }
    }
    void poll()
    const timer = setInterval(() => void poll(), 2500)
    return () => { active = false; clearInterval(timer) }
  }, [accountJob, load])

  if (state === 'loading') return <LoadingAccounts />
  if (state === 'guest') return <GuestAccounts />
  if (state === 'error') return <MiniPageLayout pageClassName="account-page" title="我的账号" align="start"><View className="account-error"><Text className="account-error-icon">!</Text><Text className="account-empty-title">账号列表暂时不可用</Text><Text className="muted">{error || '请检查网络连接后重试。'}</Text><Button className="account-secondary-button" onClick={() => void load()}>重新加载</Button></View></MiniPageLayout>

  const selectedAccount = accounts.find((account) => account.id === selectedAccountId)
  if (screen === 'detail' && selectedAccount) return <AccountDetail account={selectedAccount} conversationCount={conversationCounts[selectedAccount.id] ?? selectedAccount.friend_count} menuOpen={menuOpen} busy={busy} accountJobAction={accountJobAction} accountJobStatus={accountJobStatus} error={error} onBack={() => { setMenuOpen(false); setScreen('list') }} onMenu={() => setMenuOpen((current) => !current)} onAction={(action) => void runAccountAction(selectedAccount, action)} onDelete={() => void releaseAccount(selectedAccount)} onBind={() => openBindingFlow(selectedAccount.id)} />
  if (screen === 'intro') return <BindingIntro onBack={() => setScreen('list')} onStart={() => setScreen('method')} />
  if (screen === 'method') return <BindingMethodScreen method={bindingMethod} phone={bindingPhone} error={error} busy={busy} onBack={() => setScreen('intro')} onMethodChange={setBindingMethod} onPhoneChange={setBindingPhone} onStart={() => void startBinding()} />
  if (screen === 'qr') return <QRBindingScreen qrValue={qrValue} expiresAt={qrExpiresAt} status={bindingStatus} step={bindingStep} onBack={() => void cancelBinding()} onRefresh={() => void restartBinding()} />
  if (screen === 'progress') return <BindingProgressScreen method={bindingMethod} status={bindingStatus} step={bindingStep} jobId={bindingJobId} smsCode={smsCode} busy={busy} error={error} onBack={() => void cancelBinding()} onCodeChange={setSmsCode} onSubmitCode={() => void submitVerification()} />
  if (screen === 'success') return <BindingSuccessScreen account={successAccount} onDone={() => { setSuccessAccount(null); setScreen('list') }} onViewFriends={() => { setSuccessAccount(null); setScreen('list'); Taro.switchTab({ url: '/pages/spark/index' }) }} />

  async function runAccountAction(account: Account, action: 'session' | 'friends' | 'pause' | 'resume') {
    const token = getAccessToken()
    if (!token || busy) return
    if (account.binding_status !== 'bound') {
      setError('账号尚未完成绑定，暂不能执行此操作。')
      return
    }
    setBusy(action)
    setError('')
    let queued = false
    try {
      const idempotencyKey = createIdempotencyKey()
      let job: Awaited<ReturnType<typeof checkAccountSession>> | null = null
      if (action === 'session') job = await checkAccountSession(token, account.id, idempotencyKey)
      if (action === 'friends') job = await syncAccountFriends(token, account.id, idempotencyKey)
      if (job && (action === 'session' || action === 'friends')) {
        queued = true
        setAccountJob({ id: job.job_id, action })
        setAccountJobAction(action)
        setAccountJobStatus(jobStatusLabel('queued'))
        setMenuOpen(false)
        return
      }
      if (action === 'pause') await pauseAccount(token, account.id)
      if (action === 'resume') await resumeAccount(token, account.id)
      await Taro.showToast({ title: action === 'friends' ? '会话同步已提交' : action === 'session' ? '检查已提交' : action === 'pause' ? '任务已暂停' : '任务已恢复', icon: 'success' })
      await load()
      setMenuOpen(false)
    } catch (cause) {
      if (redirectOnAuthExpired(cause)) return
      setError(cause instanceof Error ? cause.message : '账号操作失败')
    } finally {
      if (!queued) setBusy('')
    }
  }

  async function releaseAccount(account: Account) {
    const token = getAccessToken()
    if (!token || busy) return
    const result = await Taro.showModal({ title: '解除账号绑定？', content: `将解除“${accountTabLabel(account)}”的绑定，并停止该账号未执行任务。` })
    if (!result.confirm) return
    setBusy('delete')
    try {
      await deleteAccount(token, account.id)
      setSelectedAccountId('')
      setMenuOpen(false)
      await load()
      await Taro.showToast({ title: '账号已解除', icon: 'success' })
    } catch (cause) {
      if (redirectOnAuthExpired(cause)) return
      setError(cause instanceof Error ? cause.message : '解除绑定失败')
    } finally {
      setBusy('')
    }
  }

  async function startBinding() {
    const token = getAccessToken()
    if (!token || busy || bindingJobId) return
    if (bindingMethod === 'sms' && bindingPhone.trim().length < 5) {
      setError('请输入有效的手机号')
      return
    }
    setBusy('bind')
    setError('')
    setQrValue('')
    setQrExpiresAt('')
    setBindingStep(3)
    try {
      const job = await createAccountBinding(token, bindingMethod, { phone: bindingMethod === 'sms' ? bindingPhone.trim() : undefined, accountId: bindingAccountId || undefined, idempotencyKey: createIdempotencyKey() })
      setBindingJobId(job.job_id)
      setPendingBinding({ job_id: job.job_id, method: bindingMethod, ...(bindingAccountId ? { account_id: bindingAccountId } : {}) })
      setBindingStatus('绑定任务已创建，等待后端进度')
      setScreen(bindingMethod === 'qr' ? 'qr' : 'progress')
    } catch (cause) {
      if (redirectOnAuthExpired(cause)) return
      setError(accountBindingError(cause instanceof MiniApiError ? cause.code : '', cause instanceof Error ? cause.message : undefined))
    } finally {
      setBusy('')
    }
  }

  function openBindingFlow(accountId = '') {
    setError('')
    setBindingAccountId(accountId)
    setBindingMethod('qr')
    setBindingStep(1)
    setScreen(accountId ? 'method' : 'intro')
  }

  function handleBindingEvent(event: JobEvent) {
    const state = bindingEventState(event.eventType)
    if (state) {
      setBindingStatus(state.status)
      setBindingStep(state.step)
      if (state.error) setError(jobErrorMessage(typeof event.payload.code === 'string' ? event.payload.code : '', state.error))
      setScreen(state.screen)
    } else if (event.eventType === 'qr_ready') {
      setQrValue(typeof event.payload.value === 'string' ? event.payload.value : '')
      setQrExpiresAt(typeof event.payload.expires_at === 'string' ? event.payload.expires_at : '')
      setBindingStatus('请使用抖音 App 扫描二维码')
      setBindingStep(3)
    } else if (event.eventType === 'scanned') {
      setBindingStatus('二维码已扫描，正在确认登录')
      setBindingStep(4)
      setScreen('progress')
    } else if (event.eventType === 'confirming') {
      setBindingStatus('正在获取账号信息')
      setBindingStep(4)
      setScreen('progress')
    } else if (event.eventType === 'platform_challenge') {
      setBindingStatus('需要完成抖音安全验证后继续')
      setBindingStep(4)
      setScreen('progress')
    } else if (event.eventType === 'error') {
      setError(jobErrorMessage(typeof event.payload.code === 'string' ? event.payload.code : '', '绑定失败，请重试'))
    }
  }

  async function restartBinding() {
    await cancelBinding()
    setBindingStep(2)
    setScreen('method')
  }

  async function submitVerification() {
    const token = getAccessToken()
    if (!token || !bindingJobId || busy) return
    if (!/^\d{4,8}$/.test(smsCode.trim())) {
      setError('请输入 4-8 位短信验证码')
      return
    }
    setBusy('verify')
    setError('')
    try {
      await submitSMSVerification(token, bindingJobId, smsCode.trim())
      setSmsCode('')
      setBindingStatus('验证码已提交，等待登录确认')
      setBindingStep(4)
    } catch (cause) {
      if (redirectOnAuthExpired(cause)) return
      setError(cause instanceof Error ? cause.message : '验证码提交失败')
    } finally {
      setBusy('')
    }
  }

  async function cancelBinding() {
    const token = getAccessToken()
    if (!token || !bindingJobId || busy) return
    setBusy('cancel')
    try {
      await cancelJob(token, bindingJobId)
      clearPendingBinding()
      setBindingJobId('')
      setBindingStatus('')
      await load()
      setScreen('method')
    } catch (cause) {
      if (redirectOnAuthExpired(cause)) return
      setError(cause instanceof Error ? cause.message : '取消绑定失败')
    } finally {
      setBusy('')
    }
  }

  return <MiniPageLayout
    pageClassName="account-page account-index-page"
    align="start"
    title={<View><Text className="account-page-kicker">Douyin Keeper</Text><Text className="account-page-title">我的账号</Text></View>}
    action={<MiniNavbarAction className="account-add-button" ariaLabel="添加账号" onClick={() => openBindingFlow()}>+</MiniNavbarAction>}
  >
    <View className="account-quota"><View><Text className="account-quota-label">账号概览</Text><Text className="account-quota-value">{accounts.length} <Text className="account-quota-total">/ {accountQuota ?? '∞'}</Text></Text><Text className="account-quota-caption">已绑定 / 可绑定上限</Text></View><Button className="account-quota-action" onClick={openMeEntitlement}>升级配额</Button><View className="account-quota-line"><View style={{ width: `${accountQuota ? Math.min(100, accounts.length / accountQuota * 100) : accounts.length ? 24 : 0}%` }} /></View></View>
    {error && <View className="account-inline-error"><Text>{error}</Text></View>}
    {accounts.length === 0 ? <EmptyAccounts onBind={() => openBindingFlow()} /> : <View className="account-index-list">{accounts.map((account) => <AccountCard account={account} conversationCount={conversationCounts[account.id] ?? account.friend_count} key={account.id} onSelect={() => { setSelectedAccountId(account.id); setScreen('detail') }} />)}<Button className="account-add-card" onClick={() => openBindingFlow()}><Text className="account-add-card-plus">+</Text><View><Text className="account-add-card-title">添加新账号</Text><Text className="muted">最多可绑定 {accountQuota ?? '多个'} 个账号</Text></View></Button></View>}
  </MiniPageLayout>
}

function AccountCard({ account, conversationCount, onSelect }: { account: Account; conversationCount: number; onSelect: () => void }) {
  return <Button className="account-card" onClick={onSelect}><View className="account-card-main"><Avatar src={account.avatar_url} name={account.nickname || '未命名'} size="large" /><View className="account-card-copy"><Text className="account-card-name">{accountTabLabel(account)}</Text><Text className="account-card-id">ID: {account.id.slice(0, 16)}</Text><View className="account-card-status-pills"><Text className="account-status-pill account-status-pill-online"><Text className="account-status-dot" />{bindingLabel(account.binding_status)}</Text><Text className={`account-status-pill account-status-pill-session-${account.session_status}`}>Session {sessionLabel(account.session_status)}</Text></View></View><Text className="account-chevron">›</Text></View><View className="account-card-stats"><View className="account-card-stat"><Text className="account-card-stat-value">{conversationCount}</Text><Text className="muted">活跃会话</Text></View><View className="account-card-stat"><Text className="account-card-stat-value">{account.enabled_task_count}</Text><Text className="muted">活跃任务</Text></View><View className="account-card-stat account-card-stat-last"><Text className="account-card-stat-value">{completionRate(account)}<Text className="account-card-stat-unit">%</Text></Text><Text className="muted">今日完成率</Text></View></View></Button>
}

function completionRate(account: Account) {
  const total = account.today_send_succeeded + account.today_send_failed
  return total ? Math.round(account.today_send_succeeded / total * 100) : 0
}

function redirectOnAuthExpired(cause: unknown) {
  if (!(cause instanceof MiniApiError) || cause.statusCode !== 401) return false
  openLoginPage()
  return true
}

function AccountDetail({ account, conversationCount, menuOpen, busy, accountJobAction, accountJobStatus, error, onBack, onMenu, onAction, onDelete, onBind }: { account: Account; conversationCount: number; menuOpen: boolean; busy: string; accountJobAction: AccountJobAction | ''; accountJobStatus: string; error: string; onBack: () => void; onMenu: () => void; onAction: (action: 'session' | 'friends' | 'pause' | 'resume') => void; onDelete: () => void; onBind: () => void }) {
  const [capabilities, setCapabilities] = useState<Awaited<ReturnType<typeof accountCapabilities>>['items']>([])
  useEffect(() => { const token = getAccessToken(); if (token) void accountCapabilities(token, account.id).then((result) => setCapabilities(result.items)).catch(() => setCapabilities([])) }, [account.id])
  const paused = account.risk_status === 'paused' || !!account.paused_at
  const isBound = account.binding_status === 'bound'
  const effectiveCapabilityItems = effectiveCapabilities(capabilities)
  return <MiniPageLayout pageClassName="account-page" title="账号详情" showBack onBack={onBack} action={isBound ? <MiniNavbarAction ariaLabel="账号操作" onClick={onMenu}>•••</MiniNavbarAction> : null}><View className="account-detail-hero"><Avatar src={account.avatar_url} name={account.nickname || '未命名'} size="large" /><Text className="account-detail-name">{accountTabLabel(account)}</Text><Text className="account-detail-status"><StatusDot tone={account.session_status === 'valid' ? 'green' : 'amber'} />{bindingLabel(account.binding_status)} · {sessionLabel(account.session_status)}</Text></View>{!isBound && <View className="account-pending-notice"><Text className="account-pending-title">抖音账号正在绑定</Text><Text className="muted">绑定任务完成后，才能同步会话、检查登录态或管理任务。请稍候刷新账号列表。</Text><Button className="account-secondary-button" onClick={onBack}>返回账号列表</Button></View>}{menuOpen && isBound && <View className="account-menu"><Button onClick={() => onAction('session')}>重新登录态检查 <Text>›</Text></Button><Button onClick={() => onAction('friends')}>同步会话 <Text>›</Text></Button><Button onClick={() => onAction(paused ? 'resume' : 'pause')}>{paused ? '恢复任务' : '暂停任务'} <Text>›</Text></Button><Button className="account-menu-danger" onClick={onDelete}>解除绑定 <Text>›</Text></Button></View>}{accountJobStatus && <View className="account-operation-status"><Text>{accountJobAction === 'friends' ? '会话同步' : '登录态检查'}：{accountJobStatus}</Text></View>}{error && <View className="account-inline-error"><Text>{error}</Text></View>}<View className="account-detail-card"><Text className="account-section-title">账号状态</Text><DetailRow label="登录状态" value={sessionLabel(account.session_status)} tone={account.session_status === 'valid' ? 'green' : 'amber'} /><DetailRow label="账号健康度" value={riskLabel(account.risk_status)} tone={account.risk_status === 'normal' ? 'green' : 'amber'} /><DetailRow label="活跃会话" value={`${conversationCount} 个`} /><DetailRow label="活跃任务数" value={`${account.enabled_task_count} 个`} /><DetailRow label="最近检查" value={formatDate(account.last_session_check_at)} /></View><View className="account-detail-card"><Text className="account-section-title">今日数据</Text><View className="detail-stat-grid"><DetailStat label="互动成功" value={account.today_send_succeeded} tone="green" /><DetailStat label="互动失败" value={account.today_send_failed} tone={account.today_send_failed ? 'red' : 'green'} /><DetailStat label="完成率" value={`${account.today_send_succeeded + account.today_send_failed ? Math.round(account.today_send_succeeded / (account.today_send_succeeded + account.today_send_failed) * 100) : 0}%`} tone="green" /></View></View><View className="account-detail-card"><Text className="account-section-title">能力状态</Text>{effectiveCapabilityItems.length === 0 ? <Text className="muted">暂无能力快照，稍后可重新检查。</Text> : effectiveCapabilityItems.map((item) => <DetailRow key={item.capability} label={item.capability} value={capabilityLabel(item.status)} tone={item.status === 'available' ? 'green' : 'amber'} />)}</View>{isBound && <View className="account-detail-actions"><Button className="account-primary-button" disabled={busy !== ''} onClick={() => onAction('friends')}>{busy === 'friends' ? '同步中…' : '同步会话'}</Button><Button className="account-secondary-button" disabled={busy !== ''} onClick={onBind}>重新登录</Button></View>}</MiniPageLayout>
}

function BindingIntro({ onBack, onStart }: { onBack: () => void; onStart: () => void }) {
  return <MiniPageLayout pageClassName="account-page account-binding-page" title="添加抖音账号" showBack onBack={onBack}><View className="binding-intro-hero"><MiniRemoteImage className="binding-intro-image" name="accounts/account-add-hero.png" mode="aspectFit" /></View><Text className="binding-intro-title">添加你的抖音账号</Text><Text className="muted binding-intro-copy">添加后即可管理会话与火花任务</Text><View className="binding-benefits"><Benefit title="管理消息会话" copy="从消息面板同步全部会话" tone="green" /><Benefit title="点亮火花" copy="为会话持续维护火花" tone="mint" /><Benefit title="安全加密" copy="多重加密保护账号安全" tone="blue" /></View><Button className="account-primary-button binding-start-button" onClick={onStart}>开始添加</Button></MiniPageLayout>
}

function BindingMethodScreen({ method, phone, error, busy, onBack, onMethodChange, onPhoneChange, onStart }: { method: BindingMethod; phone: string; error: string; busy: string; onBack: () => void; onMethodChange: (method: BindingMethod) => void; onPhoneChange: (phone: string) => void; onStart: () => void }) {
  return <MiniPageLayout pageClassName="account-page account-binding-page" title="选择添加方式" showBack onBack={onBack}><FlowSteps current={2} /><View className="binding-method-card"><Button className={`binding-method-option ${method === 'qr' ? 'binding-method-option-active' : ''}`} onClick={() => onMethodChange('qr')}><View className="binding-method-icon binding-method-icon-qr">QR</View><View className="binding-method-copy"><Text className="binding-method-title">二维码登录</Text><Text className="muted">使用抖音 App 扫码登录</Text></View><Text className="binding-recommended">推荐</Text></Button><Button className={`binding-method-option ${method === 'sms' ? 'binding-method-option-active' : ''}`} onClick={() => onMethodChange('sms')}><View className="binding-method-icon binding-method-icon-phone">SMS</View><View className="binding-method-copy"><Text className="binding-method-title">短信登录</Text><Text className="muted">通过手机号验证登录</Text></View><Text className="binding-fallback">备用方案</Text></Button>{method === 'sms' && <Input className="account-input binding-phone-input" value={phone} maxlength={32} placeholder="请输入手机号" onInput={(event) => onPhoneChange(event.detail.value)} />}{error && <View className="account-inline-error"><Text>{error}</Text></View>}<Button className="account-primary-button" disabled={busy === 'bind'} onClick={onStart}>{busy === 'bind' ? '创建中…' : method === 'qr' ? '继续扫码登录' : '继续短信登录'}</Button></View><View className="binding-notice"><Text className="binding-notice-title">添加须知</Text><Text>• 仅用于账号管理，不会获取你的密码</Text><Text>• 使用官方登录方式，安全有保障</Text><Text>• 绑定后可随时解除</Text></View></MiniPageLayout>
}

function QRBindingScreen({ qrValue, expiresAt, status, step, onBack, onRefresh }: { qrValue: string; expiresAt: string; status: string; step: number; onBack: () => void; onRefresh: () => void }) {
  return <MiniPageLayout pageClassName="account-page account-binding-page" title="扫码登录" showBack onBack={onBack}><FlowSteps current={3} /><Text className="binding-qr-title">请使用抖音 App 扫描二维码</Text><View className="binding-qr-box">{qrValue ? <Image className="binding-qr-image" src={qrValue} mode="aspectFit" /> : <View className="binding-qr-loading"><MiniRemoteImage className="binding-qr-loading-image" name="accounts/account-add-hero.png" mode="aspectFit" /><Text>正在获取二维码</Text></View>}</View><Text className="binding-qr-status">{status || '二维码准备中，请稍候'}</Text>{expiresAt && <Text className="binding-qr-expiry">二维码有效期至 {formatDate(expiresAt)}</Text>}<Button className="account-secondary-button binding-refresh-button" onClick={onRefresh}>刷新二维码</Button><Text className="binding-qr-help">无法扫码？请确认抖音 App 已更新到最新版本。</Text><Text className="binding-flow-step-note">当前进度：{step < 4 ? '等待扫码' : step === 4 ? '确认登录' : '添加账号'}</Text></MiniPageLayout>
}

function BindingProgressScreen({ method, status, step, jobId, smsCode, busy, error, onBack, onCodeChange, onSubmitCode }: { method: BindingMethod; status: string; step: number; jobId: string; smsCode: string; busy: string; error: string; onBack: () => void; onCodeChange: (code: string) => void; onSubmitCode: () => void }) {
  return <MiniPageLayout pageClassName="account-page account-binding-page" title="添加中" showBack onBack={onBack}><FlowSteps current={4} /><View className="binding-progress-visual"><MiniRemoteImage className="binding-progress-image" name="accounts/account-add-hero.png" mode="aspectFit" /></View><Text className="binding-progress-title-large">正在添加抖音账号</Text><Text className="muted binding-progress-copy">请保持抖音 App 已登录状态</Text><View className="binding-checklist"><ProgressItem done={step >= 3} active={step === 3} label={method === 'sms' ? '短信验证' : '二维码已扫描'} /><ProgressItem done={step >= 4} active={step === 4} label="确认登录中" /><ProgressItem done={step >= 4} active={false} label="获取账号信息" /><ProgressItem done={step >= 5} active={false} label="添加账号" /></View>{method === 'sms' && jobId && step === 3 && <View className="binding-sms-entry"><Text className="binding-sms-title">请输入抖音短信验证码</Text><Input className="account-input" value={smsCode} maxlength={8} type="number" placeholder="4-8 位验证码" onInput={(event) => onCodeChange(event.detail.value)} /><Button className="account-primary-button" disabled={busy === 'verify'} onClick={onSubmitCode}>{busy === 'verify' ? '提交中…' : '确认验证码'}</Button></View>}{error && <View className="account-inline-error"><Text>{error}</Text></View>}<View className="binding-progress-note">{status || '绑定任务执行中，请不要关闭页面'}</View></MiniPageLayout>
}

function BindingSuccessScreen({ account, onDone, onViewFriends }: { account: Account | null; onDone: () => void; onViewFriends: () => void }) {
  return <MiniPageLayout pageClassName="account-page account-binding-page" title="添加成功" showBack onBack={onDone}><FlowSteps current={5} /><View className="binding-success-visual"><MiniRemoteImage className="binding-success-image" name="accounts/account-success.png" mode="aspectFit" /></View><Text className="binding-success-title">添加成功！</Text><Text className="muted binding-success-copy">你已成功添加抖音账号</Text>{account && <View className="binding-success-account"><Avatar src={account.avatar_url} name={accountTabLabel(account)} size="large" /><View><Text className="binding-success-name">{accountTabLabel(account)}</Text><Text className="muted">账号已安全绑定</Text></View></View>}<Button className="account-primary-button" onClick={onDone}>完成</Button><Button className="binding-friends-link" onClick={onViewFriends}>去查看会话</Button></MiniPageLayout>
}
function FlowSteps({ current }: { current: number }) { return <View className="binding-flow-steps">{['进入添加页', '选择添加方式', '扫码登录', '添加中', '添加成功'].map((label, index) => <View className={`binding-flow-step ${index + 1 <= current ? 'binding-flow-step-done' : ''} ${index + 1 === current ? 'binding-flow-step-current' : ''}`} key={label}><Text className="binding-flow-number">{index + 1}</Text><Text className="binding-flow-label">{label}</Text></View>)}</View> }
function Benefit({ title, copy, tone }: { title: string; copy: string; tone: string }) { return <View className="binding-benefit"><View className={`binding-benefit-icon binding-benefit-${tone}`} /><View><Text className="binding-benefit-title">{title}</Text><Text className="muted">{copy}</Text></View></View> }
function ProgressItem({ done, active, label }: { done: boolean; active: boolean; label: string }) { return <View className={`binding-progress-item ${done ? 'binding-progress-item-done' : ''} ${active ? 'binding-progress-item-active' : ''}`}><Text className="binding-progress-dot">{done ? '✓' : ''}</Text><Text>{label}</Text></View> }

function BindingScreen({ method, phone, jobId, status, busy, error, onBack, onMethodChange, onPhoneChange, onStart, onCancel }: { method: BindingMethod; phone: string; jobId: string; status: string; busy: string; error: string; onBack: () => void; onMethodChange: (method: BindingMethod) => void; onPhoneChange: (phone: string) => void; onStart: () => void; onCancel: () => void }) {
  return <MiniPageLayout pageClassName="account-page" title="绑定新抖音账号" showBack onBack={onBack}><View className="binding-steps"><Step active={1} label="选择方式" /><Step active={2} label="等待登录" /><Step active={3} label="绑定完成" /></View><View className="binding-card"><Text className="account-section-title">选择登录方式</Text><Text className="muted">扫码登录适合快速绑定；短信方式需要手机号和验证码。</Text><View className="binding-methods"><Button className={method === 'qr' ? 'binding-method-active' : ''} onClick={() => onMethodChange('qr')}>扫码登录</Button><Button className={method === 'sms' ? 'binding-method-active' : ''} onClick={() => onMethodChange('sms')}>短信登录</Button></View>{method === 'sms' && <Input className="account-input" value={phone} maxlength={32} placeholder="请输入手机号" onInput={(event) => onPhoneChange(event.detail.value)} />}{jobId ? <View className="binding-progress"><Text className="binding-progress-mark">{method === 'qr' ? '⌁' : '✉'}</Text><Text className="binding-progress-title">{method === 'qr' ? '等待抖音扫码登录' : '等待短信验证'}</Text><Text className="muted">{status || '绑定任务执行中'} · 请保持页面打开</Text><Button className="account-secondary-button" disabled={busy === 'cancel'} onClick={onCancel}>{busy === 'cancel' ? '取消中…' : '取消绑定'}</Button></View> : <><Text className="binding-hint">{method === 'qr' ? '点击开始后，后端会创建二维码登录任务。' : '手机号只用于本次登录流程，不会写入账号资料。'}</Text><Button className="account-primary-button" disabled={busy === 'bind'} onClick={onStart}>{busy === 'bind' ? '创建中…' : '开始绑定'}</Button></>}</View>{error && <View className="account-inline-error"><Text>{error}</Text></View>}<View className="binding-safe-note"><Text className="binding-safe-mark">✓</Text><Text>登录态只由后端安全保存；安全验证由抖音官方页面完成。</Text></View></MiniPageLayout>
}

function Step({ active, label }: { active: number; label: string }) { return <View className="binding-step"><Text className={`binding-step-number ${active === 1 ? 'binding-step-current' : ''}`}>{active}</Text><Text>{label}</Text></View> }
function DetailRow({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'amber' }) { return <View className="detail-row"><Text className="detail-row-label">{label}</Text><Text className={`detail-row-value ${tone ? `detail-row-${tone}` : ''}`}>{tone && <StatusDot tone={tone} />}{value}</Text></View> }
function DetailStat({ label, value, tone }: { label: string; value: string | number; tone: 'green' | 'red' }) { return <View className="detail-stat"><Text className={`detail-stat-value detail-stat-${tone}`}>{value}</Text><Text className="muted">{label}</Text></View> }
function Avatar({ src, name, size = 'normal' }: { src?: string | null; name: string; size?: 'normal' | 'large' }) { return <View className={`avatar avatar-${size}`}>{src ? <Image className="avatar-image" src={src} mode="aspectFill" /> : <MiniRemoteImage className="avatar-image" name={avatarAssetFor(name)} mode="aspectFill" />}</View> }
function StatusDot({ tone }: { tone: 'green' | 'amber' }) { return <Text className={`status-dot-small status-dot-small-${tone}`} /> }
function EmptyAccounts({ onBind }: { onBind: () => void }) { return <View className="account-empty"><MiniRemoteImage className="account-empty-image" name="home/empty-gift-box.png" mode="aspectFit" /><Text className="account-empty-title">还没有绑定抖音账号</Text><Text className="muted">绑定后即可管理会话与火花任务。</Text><Button className="account-primary-button" onClick={onBind}>去绑定账号</Button></View> }
function GuestAccounts() { return <MiniPageLayout pageClassName="account-page" title="我的账号" align="start"><View className="account-empty"><Text className="account-empty-title">请先登录</Text><Text className="muted">登录后才能管理抖音账号。</Text><Button className="account-primary-button" onClick={() => Taro.switchTab({ url: '/pages/login/index' })}>去登录 / 绑定</Button></View></MiniPageLayout> }
function LoadingAccounts() { return <MiniPageLayout pageClassName="account-page" title={<View className="account-skeleton account-skeleton-header" />} align="start"><View className="account-skeleton account-skeleton-quota" /><View className="account-skeleton account-skeleton-card" /><View className="account-skeleton account-skeleton-card" /></MiniPageLayout> }
function bindingLabel(value: string) { return value === 'bound' ? '在线' : value === 'binding' ? '绑定中' : value === 'released' ? '已解除' : '未绑定' }
function sessionLabel(value: string) { return value === 'valid' ? '正常' : value === 'expired' ? '已过期' : value === 'challenge_required' ? '需验证' : '待检查' }
function riskLabel(value: string) { return value === 'normal' ? '良好' : value === 'paused' ? '已暂停' : '冷却中' }
function capabilityLabel(value: string) { return value === 'available' ? '可用' : value === 'degraded' ? '降级' : value === 'unavailable' ? '不可用' : '待检查' }
function jobStatusLabel(value: string) { return value === 'waiting_user' ? '等待你的操作' : value === 'running' ? '执行中' : value === 'succeeded' ? '已完成' : value === 'failed' ? '执行失败' : value === 'cancelled' ? '已取消' : '排队中' }
function formatDate(value?: string | null) { return value ? new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '暂无记录' }
function avatarAssetFor(name: string) { const value = name.toLowerCase(); if (value.includes('jasper') || name.includes('杰') || name.includes('雅')) return 'home/avatar-jasper.png'; if (value.includes('chen') || name.includes('陈')) return 'home/avatar-chen.png'; return 'home/avatar-miles.png' }
