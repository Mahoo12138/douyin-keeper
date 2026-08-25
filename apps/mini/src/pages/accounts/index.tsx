import { useCallback, useEffect, useState } from 'react'
import { Button, Image, Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

import { accountCapabilities, cancelJob, checkAccountSession, createAccountBinding, deleteAccount, getJob, listAccounts, MiniApiError, myEntitlement, pauseAccount, resumeAccount, syncAccountFriends } from '@/lib/api'
import { getAccessToken } from '@/lib/session'
import avatarChen from '@/assets/home/avatar-chen.png'
import avatarJasper from '@/assets/home/avatar-jasper.png'
import avatarMiles from '@/assets/home/avatar-miles.png'
import emptyGiftBox from '@/assets/home/empty-gift-box.png'

type Account = Awaited<ReturnType<typeof listAccounts>>['items'][number]
type Screen = 'list' | 'detail' | 'bind'
type BindingMethod = 'qr' | 'sms'

export default function Accounts() {
  const [state, setState] = useState<'loading' | 'guest' | 'ready' | 'error'>('loading')
  const [accounts, setAccounts] = useState<Account[]>([])
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
      setAccounts(accountResponse.items)
      setAccountQuota(entitlementResponse?.account_quota ?? null)
      setState('ready')
    } catch (cause) {
      if (cause instanceof MiniApiError && cause.statusCode === 401) {
        setState('guest')
        return
      }
      setError(cause instanceof Error ? cause.message : '账号列表加载失败')
      setState('error')
    }
  }, [])

  useEffect(() => { void load() }, [load])

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
          setBindingJobId('')
          setBindingStatus('绑定成功，正在刷新账号')
          await load()
          if (active) setScreen('list')
        } else if (job.status === 'failed' || job.status === 'cancelled') {
          setBindingJobId('')
          setError(job.error_code || '绑定任务未完成，请重试。')
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : '绑定状态查询失败')
      }
    }
    void poll()
    const timer = setInterval(() => void poll(), 2500)
    return () => { active = false; clearInterval(timer) }
  }, [bindingJobId, load])

  if (state === 'loading') return <LoadingAccounts />
  if (state === 'guest') return <GuestAccounts />
  if (state === 'error') return <View className="mini-page account-page"><View className="account-error"><Text className="account-error-icon">!</Text><Text className="account-empty-title">账号列表暂时不可用</Text><Text className="muted">{error || '请检查网络连接后重试。'}</Text><Button className="account-secondary-button" onClick={() => void load()}>重新加载</Button></View></View>

  const selectedAccount = accounts.find((account) => account.id === selectedAccountId)
  if (screen === 'detail' && selectedAccount) return <AccountDetail account={selectedAccount} menuOpen={menuOpen} busy={busy} error={error} onBack={() => { setMenuOpen(false); setScreen('list') }} onMenu={() => setMenuOpen((current) => !current)} onAction={(action) => void runAccountAction(selectedAccount, action)} onDelete={() => void releaseAccount(selectedAccount)} onBind={() => { setMenuOpen(false); setBindingAccountId(selectedAccount.id); setBindingMethod('qr'); setScreen('bind') }} />
  if (screen === 'bind') return <BindingScreen method={bindingMethod} phone={bindingPhone} jobId={bindingJobId} status={bindingStatus} busy={busy} error={error} onBack={() => { setBindingJobId(''); setBindingAccountId(''); setScreen('list') }} onMethodChange={setBindingMethod} onPhoneChange={setBindingPhone} onStart={() => void startBinding()} onCancel={() => void cancelBinding()} />

  async function runAccountAction(account: Account, action: 'session' | 'friends' | 'pause' | 'resume') {
    const token = getAccessToken()
    if (!token || busy) return
    setBusy(action)
    setError('')
    try {
      if (action === 'session') await checkAccountSession(token, account.id)
      if (action === 'friends') await syncAccountFriends(token, account.id)
      if (action === 'pause') await pauseAccount(token, account.id)
      if (action === 'resume') await resumeAccount(token, account.id)
      await Taro.showToast({ title: action === 'friends' ? '好友同步已提交' : action === 'session' ? '检查已提交' : action === 'pause' ? '任务已暂停' : '任务已恢复', icon: 'success' })
      await load()
      setMenuOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '账号操作失败')
    } finally {
      setBusy('')
    }
  }

  async function releaseAccount(account: Account) {
    const token = getAccessToken()
    if (!token || busy) return
    const result = await Taro.showModal({ title: '解除账号绑定？', content: `将解除“${account.nickname || '未命名账号'}”的绑定，并停止该账号未执行任务。` })
    if (!result.confirm) return
    setBusy('delete')
    try {
      await deleteAccount(token, account.id)
      setSelectedAccountId('')
      setMenuOpen(false)
      await load()
      await Taro.showToast({ title: '账号已解除', icon: 'success' })
    } catch (cause) {
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
    try {
      const job = await createAccountBinding(token, bindingMethod, { phone: bindingMethod === 'sms' ? bindingPhone.trim() : undefined, accountId: bindingAccountId || undefined })
      setBindingJobId(job.job_id)
      setBindingStatus('绑定任务已创建，等待后端进度')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建绑定任务失败')
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
      setBindingJobId('')
      setBindingStatus('')
      setBindingAccountId('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '取消绑定失败')
    } finally {
      setBusy('')
    }
  }

  return <View className="mini-page account-page">
    <View className="account-page-header"><View><Text className="account-page-kicker">Douyin Keeper</Text><Text className="account-page-title">我的账号</Text></View><Button className="account-add-button" onClick={() => { setError(''); setBindingAccountId(''); setScreen('bind') }}>+</Button></View>
    <View className="account-quota"><View><Text className="account-quota-label">账号概览</Text><Text className="account-quota-value">{accounts.length} <Text className="account-quota-total">/ {accountQuota ?? '∞'}</Text></Text><Text className="account-quota-caption">已绑定 / 可绑定上限</Text></View><Button className="account-quota-action" onClick={() => { setError(''); setScreen('bind') }}>升级配额</Button><View className="account-quota-line"><View style={{ width: `${accountQuota ? Math.min(100, accounts.length / accountQuota * 100) : accounts.length ? 24 : 0}%` }} /></View></View>
    {error && <View className="account-inline-error"><Text>{error}</Text></View>}
    {accounts.length === 0 ? <EmptyAccounts onBind={() => { setBindingAccountId(''); setScreen('bind') }} /> : <View>{accounts.map((account) => <AccountCard account={account} key={account.id} onSelect={() => { setSelectedAccountId(account.id); setScreen('detail') }} />)}<Button className="account-add-card" onClick={() => { setBindingAccountId(''); setScreen('bind') }}><Text className="account-add-card-plus">+</Text><View><Text>添加新账号</Text><Text className="muted">最多可绑定 {accountQuota ?? '多个'} 个账号</Text></View></Button></View>}
  </View>
}

function AccountCard({ account, onSelect }: { account: Account; onSelect: () => void }) {
  return <Button className="account-card" onClick={onSelect}><Avatar src={account.avatar_url} name={account.nickname || '未命名'} size="large" /><View className="account-card-copy"><View className="account-card-top"><Text className="account-card-name">{account.nickname || '未命名账号'}</Text><Text className={`account-tag account-tag-${account.binding_status}`}>{bindingLabel(account.binding_status)}</Text></View><Text className="account-card-status"><StatusDot tone={account.session_status === 'valid' ? 'green' : 'amber'} />{sessionLabel(account.session_status)}</Text><View className="account-card-stats"><View><Text>{account.friend_count}</Text><Text className="muted">活跃好友</Text></View><View><Text>{account.enabled_task_count}</Text><Text className="muted">活跃任务</Text></View><View><Text>{completionRate(account)}%</Text><Text className="muted">今日完成率</Text></View></View></View><Text className="account-chevron">›</Text></Button>
}

function completionRate(account: Account) {
  const total = account.today_send_succeeded + account.today_send_failed
  return total ? Math.round(account.today_send_succeeded / total * 100) : 0
}

function AccountDetail({ account, menuOpen, busy, error, onBack, onMenu, onAction, onDelete, onBind }: { account: Account; menuOpen: boolean; busy: string; error: string; onBack: () => void; onMenu: () => void; onAction: (action: 'session' | 'friends' | 'pause' | 'resume') => void; onDelete: () => void; onBind: () => void }) {
  const [capabilities, setCapabilities] = useState<Awaited<ReturnType<typeof accountCapabilities>>['items']>([])
  useEffect(() => { const token = getAccessToken(); if (token) void accountCapabilities(token, account.id).then((result) => setCapabilities(result.items)).catch(() => setCapabilities([])) }, [account.id])
  const paused = account.risk_status === 'paused' || !!account.paused_at
  return <View className="mini-page account-page"><View className="account-detail-topbar"><Button className="account-back-button" onClick={onBack}>‹</Button><Text>账号详情</Text><Button className="account-more-button" onClick={onMenu}>•••</Button></View><View className="account-detail-hero"><Avatar src={account.avatar_url} name={account.nickname || '未命名'} size="large" /><Text className="account-detail-name">{account.nickname || '未命名账号'}</Text><Text className="account-detail-status"><StatusDot tone={account.session_status === 'valid' ? 'green' : 'amber'} />{bindingLabel(account.binding_status)} · {sessionLabel(account.session_status)}</Text></View>{menuOpen && <View className="account-menu"><Button onClick={() => onAction('session')}>重新登录态检查 <Text>›</Text></Button><Button onClick={() => onAction('friends')}>同步好友 <Text>›</Text></Button><Button onClick={() => onAction(paused ? 'resume' : 'pause')}>{paused ? '恢复任务' : '暂停任务'} <Text>›</Text></Button><Button className="account-menu-danger" onClick={onDelete}>解除绑定 <Text>›</Text></Button></View>}{error && <View className="account-inline-error"><Text>{error}</Text></View>}<View className="account-detail-card"><Text className="account-section-title">账号状态</Text><DetailRow label="登录状态" value={sessionLabel(account.session_status)} tone={account.session_status === 'valid' ? 'green' : 'amber'} /><DetailRow label="账号健康度" value={riskLabel(account.risk_status)} tone={account.risk_status === 'normal' ? 'green' : 'amber'} /><DetailRow label="好友总数" value={`${account.friend_count} 位`} /><DetailRow label="活跃任务数" value={`${account.enabled_task_count} 个`} /><DetailRow label="最近检查" value={formatDate(account.last_session_check_at)} /></View><View className="account-detail-card"><Text className="account-section-title">今日数据</Text><View className="detail-stat-grid"><DetailStat label="互动成功" value={account.today_send_succeeded} tone="green" /><DetailStat label="互动失败" value={account.today_send_failed} tone={account.today_send_failed ? 'red' : 'green'} /><DetailStat label="完成率" value={`${account.today_send_succeeded + account.today_send_failed ? Math.round(account.today_send_succeeded / (account.today_send_succeeded + account.today_send_failed) * 100) : 0}%`} tone="green" /></View></View><View className="account-detail-card"><Text className="account-section-title">能力状态</Text>{capabilities.length === 0 ? <Text className="muted">暂无能力快照，稍后可重新检查。</Text> : capabilities.map((item) => <DetailRow key={item.capability} label={item.capability} value={capabilityLabel(item.status)} tone={item.status === 'available' ? 'green' : 'amber'} />)}</View><View className="account-detail-actions"><Button className="account-primary-button" disabled={busy !== ''} onClick={() => onAction('friends')}>{busy === 'friends' ? '同步中…' : '同步好友'}</Button><Button className="account-secondary-button" disabled={busy !== ''} onClick={onBind}>重新登录</Button></View></View>
}

function BindingScreen({ method, phone, jobId, status, busy, error, onBack, onMethodChange, onPhoneChange, onStart, onCancel }: { method: BindingMethod; phone: string; jobId: string; status: string; busy: string; error: string; onBack: () => void; onMethodChange: (method: BindingMethod) => void; onPhoneChange: (phone: string) => void; onStart: () => void; onCancel: () => void }) {
  return <View className="mini-page account-page"><View className="account-detail-topbar"><Button className="account-back-button" onClick={onBack}>‹</Button><Text>绑定新抖音账号</Text><View className="account-topbar-spacer" /></View><View className="binding-steps"><Step active={1} label="选择方式" /><Step active={2} label="等待登录" /><Step active={3} label="绑定完成" /></View><View className="binding-card"><Text className="account-section-title">选择登录方式</Text><Text className="muted">扫码登录适合快速绑定；短信方式需要手机号和验证码。</Text><View className="binding-methods"><Button className={method === 'qr' ? 'binding-method-active' : ''} onClick={() => onMethodChange('qr')}>扫码登录</Button><Button className={method === 'sms' ? 'binding-method-active' : ''} onClick={() => onMethodChange('sms')}>短信登录</Button></View>{method === 'sms' && <Input className="account-input" value={phone} maxlength={32} placeholder="请输入手机号" onInput={(event) => onPhoneChange(event.detail.value)} />}{jobId ? <View className="binding-progress"><Text className="binding-progress-mark">{method === 'qr' ? '⌁' : '✉'}</Text><Text className="binding-progress-title">{method === 'qr' ? '等待抖音扫码登录' : '等待短信验证'}</Text><Text className="muted">{status || '绑定任务执行中'} · 请保持页面打开</Text><Button className="account-secondary-button" disabled={busy === 'cancel'} onClick={onCancel}>{busy === 'cancel' ? '取消中…' : '取消绑定'}</Button></View> : <><Text className="binding-hint">{method === 'qr' ? '点击开始后，后端会创建二维码登录任务。' : '手机号只用于本次登录流程，不会写入账号资料。'}</Text><Button className="account-primary-button" disabled={busy === 'bind'} onClick={onStart}>{busy === 'bind' ? '创建中…' : '开始绑定'}</Button></>}</View>{error && <View className="account-inline-error"><Text>{error}</Text></View>}<View className="binding-safe-note"><Text className="binding-safe-mark">✓</Text><Text>登录态只由后端安全保存；安全验证由抖音官方页面完成。</Text></View></View>
}

function Step({ active, label }: { active: number; label: string }) { return <View className="binding-step"><Text className={`binding-step-number ${active === 1 ? 'binding-step-current' : ''}`}>{active}</Text><Text>{label}</Text></View> }
function DetailRow({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'amber' }) { return <View className="detail-row"><Text className="detail-row-label">{label}</Text><Text className={`detail-row-value ${tone ? `detail-row-${tone}` : ''}`}>{tone && <StatusDot tone={tone} />}{value}</Text></View> }
function DetailStat({ label, value, tone }: { label: string; value: string | number; tone: 'green' | 'red' }) { return <View className="detail-stat"><Text className={`detail-stat-value detail-stat-${tone}`}>{value}</Text><Text className="muted">{label}</Text></View> }
function Avatar({ src, name, size = 'normal' }: { src?: string | null; name: string; size?: 'normal' | 'large' }) { const imageSrc = src || avatarAssetFor(name); return <View className={`avatar avatar-${size}`}><Image className="avatar-image" src={imageSrc} mode="aspectFill" /></View> }
function StatusDot({ tone }: { tone: 'green' | 'amber' }) { return <Text className={`status-dot-small status-dot-small-${tone}`} /> }
function EmptyAccounts({ onBind }: { onBind: () => void }) { return <View className="account-empty"><Image className="account-empty-image" src={emptyGiftBox} mode="aspectFit" /><Text className="account-empty-title">还没有绑定抖音账号</Text><Text className="muted">绑定后即可管理好友与火花任务。</Text><Button className="account-primary-button" onClick={onBind}>去绑定账号</Button></View> }
function GuestAccounts() { return <View className="mini-page account-page"><View className="account-empty"><Text className="account-empty-title">请先登录</Text><Text className="muted">登录后才能管理抖音账号。</Text><Button className="account-primary-button" onClick={() => Taro.switchTab({ url: '/pages/login/index' })}>去登录 / 绑定</Button></View></View> }
function LoadingAccounts() { return <View className="mini-page account-page"><View className="account-skeleton account-skeleton-header" /><View className="account-skeleton account-skeleton-quota" /><View className="account-skeleton account-skeleton-card" /><View className="account-skeleton account-skeleton-card" /></View> }
function bindingLabel(value: string) { return value === 'bound' ? '在线' : value === 'binding' ? '绑定中' : value === 'released' ? '已解除' : '未绑定' }
function sessionLabel(value: string) { return value === 'valid' ? '正常' : value === 'expired' ? '已过期' : value === 'challenge_required' ? '需验证' : '待检查' }
function riskLabel(value: string) { return value === 'normal' ? '良好' : value === 'paused' ? '已暂停' : '冷却中' }
function capabilityLabel(value: string) { return value === 'available' ? '可用' : value === 'degraded' ? '降级' : value === 'unavailable' ? '不可用' : '待检查' }
function jobStatusLabel(value: string) { return value === 'waiting_user' ? '等待你的操作' : value === 'running' ? '执行中' : value === 'succeeded' ? '已完成' : value === 'failed' ? '执行失败' : value === 'cancelled' ? '已取消' : '排队中' }
function formatDate(value?: string | null) { return value ? new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '暂无记录' }
function avatarAssetFor(name: string) { const value = name.toLowerCase(); if (value.includes('jasper') || name.includes('杰') || name.includes('雅')) return avatarJasper; if (value.includes('chen') || name.includes('陈')) return avatarChen; return avatarMiles }
