import { Button, Card, CardContent } from '@douyin-keeper/ui-web'
import { Ban, RefreshCw } from 'lucide-react'

import type { BindingState } from './account-types'

export function AccountBindingPanel({ binding, onCancel }: { binding: BindingState; onCancel: () => void }) {
  const statusText = {
    queued: '正在排队…',
    running: '正在打开登录窗口…',
    waiting_user: '请使用抖音 App 扫描二维码',
    scanned: '已扫码，等待平台确认…',
    confirming: '正在验证登录状态…',
    error: '绑定失败，请重新尝试',
  }[binding.status]

  return (
    <Card className="overflow-hidden border-primary/20 bg-primary/[0.03]">
      <CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          {binding.qr ? (
            <div className="shrink-0 rounded-xl bg-white p-3 shadow-sm">
              <img src={binding.qr} alt="抖音登录二维码" className="size-44" />
            </div>
          ) : (
            <div className="flex size-44 shrink-0 items-center justify-center rounded-xl bg-muted">
              <RefreshCw className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}
          <div className="space-y-2">
            <div className="text-base font-semibold">扫码绑定</div>
            <p className="text-sm text-muted-foreground">{statusText}</p>
            {binding.expiresAt && binding.status === 'waiting_user' && (
              <p className="text-xs text-muted-foreground">二维码有效期至 {new Date(binding.expiresAt).toLocaleTimeString('zh-CN')}</p>
            )}
            {binding.status === 'error' && <p className="text-xs text-destructive">请确认抖音 App 已完成扫码并重试。</p>}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onCancel}>
          <Ban />
          取消绑定
        </Button>
      </CardContent>
    </Card>
  )
}
