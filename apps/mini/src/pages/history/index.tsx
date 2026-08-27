import { useCallback, useMemo, useRef, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'

import { getAccessToken } from '@/lib/session'
import { listSendIntents, MiniApiError } from '@/lib/api'
import { dayKey, filterHistory, localDayRange, recentDays, statusMeta, taskLabel, type HistoryFilter, type HistoryItem } from '@/features/history/history-utils'
import { PRODUCT_TIMEZONE } from '@/features/time/time-utils'
import { accountTabLabel } from '@/components/account-tab-utils'
import { MiniButton as Button } from '@/components/mini-button'

export default function History() {
  const [state, setState] = useState<'loading' | 'guest' | 'ready' | 'error'>('loading')
  const [items, setItems] = useState<HistoryItem[]>([])
  const [selectedDay, setSelectedDay] = useState(() => dayKey(new Date()))
  const selectedDayRef = useRef(selectedDay)
  const [filter, setFilter] = useState<HistoryFilter>('all')
  const [error, setError] = useState('')
  const days = useMemo(() => recentDays(), [])

  const load = useCallback(async (day = selectedDayRef.current) => {
    const token = getAccessToken()
    if (!token) {
      setState('guest')
      return
    }
    setState('loading')
    setError('')
    try {
      const response = await listSendIntents(token, localDayRange(day))
      setItems(response.items)
      setState('ready')
    } catch (cause) {
      if (cause instanceof MiniApiError && cause.statusCode === 401) {
        setState('guest')
        return
      }
      setError(cause instanceof Error ? cause.message : '发送记录加载失败')
      setState('error')
    }
  }, [])

  useDidShow(() => { void load() })

  function chooseDay(day: string) {
    selectedDayRef.current = day
    setSelectedDay(day)
    void load(day)
  }

  if (state === 'loading') return <LoadingHistory />
  if (state === 'guest') return <GuestHistory />
  if (state === 'error') return <ErrorHistory message={error} onRetry={() => void load()} />

  const visibleItems = filterHistory(items, filter)
  const successCount = items.filter((item) => item.status === 'succeeded').length
  const attentionCount = items.filter((item) => ['failed', 'retry_wait'].includes(item.status)).length

  return <View className="mini-page"><View className="mini-hero card"><Text className="eyebrow">M4 · 运行记录</Text><Text className="title mini-hero-title">发送记录</Text><Text className="muted">按日期查看火花维护的执行结果和失败原因。</Text></View><View className="date-tabs">{days.map((day) => <Button key={day} className={`date-tab ${day === selectedDay ? 'date-tab-active' : ''}`} onClick={() => chooseDay(day)}>{dayLabel(day)}</Button>)}</View><View className="metric-grid"><Metric label="记录总数" value={items.length} tone="neutral" /><Metric label="已成功" value={successCount} tone="success" /><Metric label="需关注" value={attentionCount} tone={attentionCount ? 'warning' : 'neutral'} /></View><FilterTabs value={filter} onChange={setFilter} />{visibleItems.length === 0 ? <View className="card empty-card"><Text className="card-title">暂无发送记录</Text><Text className="muted">{filter === 'all' ? '这一天还没有任务执行记录。' : '当前筛选下没有匹配记录。'}</Text></View> : <View>{visibleItems.map((item) => <HistoryCard key={item.id} item={item} />)}</View>}</View>
}

function Metric({ label, value, tone }: { label: string; value: number; tone: 'success' | 'warning' | 'neutral' }) {
  return <View className={`metric metric-${tone}`}><Text className="metric-value">{value}</Text><Text className="metric-label">{label}</Text></View>
}

function FilterTabs({ value, onChange }: { value: HistoryFilter; onChange: (value: HistoryFilter) => void }) {
  const options: { value: HistoryFilter; label: string }[] = [{ value: 'all', label: '全部' }, { value: 'active', label: '处理中' }, { value: 'succeeded', label: '成功' }, { value: 'failed', label: '失败' }, { value: 'skipped', label: '跳过/取消' }]
  return <View className="filter-tabs">{options.map((option) => <Button key={option.value} className={`filter-tab ${option.value === value ? 'filter-tab-active' : ''}`} onClick={() => onChange(option.value)}>{option.label}</Button>)}</View>
}

function HistoryCard({ item }: { item: HistoryItem }) {
  const status = statusMeta[item.status]
  const job = item.latest_job
  return <View className="card history-card"><View className="card-heading"><View><Text className="card-title">{item.friend.display_name}</Text><Text className="muted">{accountTabLabel(item.account)} · {formatTime(item.scheduled_at)}</Text></View><Text className={`history-status history-status-${status.tone}`}>{status.label}</Text></View><View className="history-grid"><View><Text className="history-label">任务</Text><Text className="history-value">{taskLabel(item)}</Text></View><View><Text className="history-label">通道</Text><Text className="history-value">{job?.adapter || '待分配'}</Text></View></View>{item.error_code && <View className="history-error"><Text>{item.error_code}</Text></View>}{item.intent_type === 'manual' && <Text className="muted history-manual">手动执行</Text>}</View>
}

function GuestHistory() { return <View className="mini-page"><View className="card empty-card"><Text className="card-title">请先登录</Text><Text className="muted">登录后才能查看发送记录。</Text><Button className="mini-button primary-button" onClick={() => Taro.switchTab({ url: '/pages/login/index' })}>去登录 / 绑定</Button></View></View> }
function ErrorHistory({ message, onRetry }: { message: string; onRetry: () => void }) { return <View className="mini-page"><View className="card empty-card"><Text className="card-title">发送记录暂时不可用</Text><Text className="muted">{message || '请检查网络连接后重试。'}</Text><Button className="mini-button secondary-button" onClick={onRetry}>重新加载</Button></View></View> }
function LoadingHistory() { return <View className="mini-page"><View className="card loading-card"><View className="loading-line loading-line-wide" /><View className="loading-line" /><View className="loading-block" /></View><View className="metric-grid"><View className="loading-block metric-loading" /><View className="loading-block metric-loading" /><View className="loading-block metric-loading" /></View></View> }
function dayLabel(value: string) { const today = dayKey(new Date()); if (value === today) return '今天'; const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1); if (value === dayKey(yesterday)) return '昨天'; return value.slice(5).replace('-', '/') }
function formatTime(value: string) { return new Intl.DateTimeFormat('zh-CN', { timeZone: PRODUCT_TIMEZONE, hour: '2-digit', minute: '2-digit' }).format(new Date(value)) }
