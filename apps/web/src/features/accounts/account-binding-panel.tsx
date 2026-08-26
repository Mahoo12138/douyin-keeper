import { useState } from 'react'
import { Button, Card, CardContent, Input, Label } from '@douyin-keeper/ui-web'
import { Ban, Check, MessageSquareText, RefreshCw, ShieldAlert } from 'lucide-react'

import type { BindingState } from './account-types'

export function AccountBindingPanel({ binding, relogin = false, onCancel, onSubmitSMSCode, submittingCode }: { binding: BindingState; relogin?: boolean; onCancel: () => void; onSubmitSMSCode?: (code: string) => Promise<void>; submittingCode?: boolean }) {
  const [code, setCode] = useState('')
  const isSMS = binding.method === 'sms'
  const statusText = isSMS ? {
    queued: '正在排队…',
    running: '正在打开短信登录…',
    waiting_user: '验证码已发送，请输入验证码',
    challenge_required: '请在打开的抖音窗口完成安全验证，完成后会自动继续…',
    scanned: '已提交验证码，等待平台确认…',
    confirming: '正在验证登录状态…',
    error: `${relogin ? '重新登录' : '绑定'}失败，请重新尝试`,
  }[binding.status] : {
    queued: '正在排队…',
    running: '正在打开登录窗口…',
    waiting_user: '请使用抖音 App 扫描二维码',
    challenge_required: '请在打开的抖音窗口完成安全验证，完成后会自动继续…',
    scanned: '已扫码，等待平台确认…',
    confirming: '正在验证登录状态…',
    error: `${relogin ? '重新登录' : '绑定'}失败，请重新尝试`,
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
              {isSMS && binding.status === 'waiting_user' ? <MessageSquareText className="size-10 text-primary" /> : binding.status === 'challenge_required' ? <ShieldAlert className="size-10 text-amber-600" /> : <RefreshCw className="size-6 animate-spin text-muted-foreground" />}
            </div>
          )}
          <div className="space-y-2">
            <div className="text-base font-semibold">{relogin ? (isSMS ? '短信验证码重新登录' : '扫码重新登录') : (isSMS ? '短信验证码绑定' : '扫码绑定')}</div>
            <p className="text-sm text-muted-foreground">{statusText}</p>
            {binding.expiresAt && binding.status === 'waiting_user' && (
              <p className="text-xs text-muted-foreground">{isSMS ? '验证码' : '二维码'}有效期至 {new Date(binding.expiresAt).toLocaleTimeString('zh-CN')}</p>
            )}
            {binding.status === 'error' && <p className="text-xs text-destructive">{isSMS ? '请确认手机号和验证码后重试，原有登录态未改变。' : '请确认抖音 App 已完成扫码并重试，原有登录态未改变。'}</p>}
            {isSMS && binding.status === 'waiting_user' && onSubmitSMSCode && (
              <form className="mt-4 flex max-w-sm items-end gap-2" onSubmit={(event) => { event.preventDefault(); if (code.trim()) void onSubmitSMSCode(code.trim()) }}>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Label htmlFor="sms-verification-code">验证码</Label>
                  <Input id="sms-verification-code" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} placeholder="输入 4–8 位验证码" />
                </div>
                <Button type="submit" disabled={submittingCode || code.length < 4}>
                  <Check />
                  {submittingCode ? '提交中…' : '提交'}
                </Button>
              </form>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onCancel}>
          <Ban />
          {relogin ? '取消重新登录' : '取消绑定'}
        </Button>
      </CardContent>
    </Card>
  )
}
