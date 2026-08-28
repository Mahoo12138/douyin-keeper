import { Badge } from '@douyin-keeper/ui-web'

import type { Account, Capability } from './account-types'

export function StatusBadge({ label, variant }: { label: string; variant: 'success' | 'warning' | 'destructive' | 'muted' }) {
  return <Badge variant={variant} className="px-1.5 py-0 text-[10px]">{label}</Badge>
}

export function bindingLabel(status: Account['binding_status']) {
  return { bound: '已绑定', binding: '绑定中', unbound: '未绑定', released: '已释放' }[status]
}

export function sessionLabel(status: Account['session_status']) {
  return { valid: '会话有效', expired: '会话过期', challenge_required: '需验证', unknown: '未检查' }[status]
}

export function riskLabel(status: Account['risk_status']) {
  return { normal: '正常', cooling_down: '冷却中', paused: '已暂停' }[status]
}

export function capabilityLabel(name: string) {
  return {
    'login.qr': '扫码登录',
    'login.sms': '短信验证码登录',
    'session.validate': '会话验证',
    'friends.sync': '会话同步',
    'message.send.text.existing': '已有会话发送文字',
    'message.send.text.first': '首次发送文字',
    'message.send.sticker.existing': '已有会话发送贴纸',
  }[name] ?? name
}

export function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString('zh-CN') : '—'
}

export function CapabilityItem({ capability }: { capability: Capability }) {
  const variant = capability.status === 'available' ? 'success' : capability.status === 'degraded' ? 'warning' : 'muted'
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2.5">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{capabilityLabel(capability.capability)}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{capability.adapter ?? '未分配 adapter'}</div>
      </div>
      <Badge variant={variant}>{capability.status}</Badge>
    </div>
  )
}
