import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { Button, Card, CardContent, Input, Label } from '@douyin-keeper/ui-web'
import { Ban, Check, MessageSquareText, RefreshCw, ShieldAlert } from 'lucide-react'

import type { BindingState } from './account-types'

export function AccountBindingPanel({ binding, relogin = false, onCancel, onSubmitSMSCode, submittingCode }: { binding: BindingState; relogin?: boolean; onCancel: () => void; onSubmitSMSCode?: (code: string) => Promise<void>; submittingCode?: boolean }) {
  const [codeDigits, setCodeDigits] = useState<string[]>(() => Array.from({ length: 6 }, () => ''))
  const isSMS = binding.method === 'sms'
  const awaitingSMSCode = binding.status === 'waiting_user' && !binding.qr && !!onSubmitSMSCode
  const code = codeDigits.join('')
  useEffect(() => {
    if (binding.status !== 'waiting_user') setCodeDigits(Array.from({ length: 6 }, () => ''))
  }, [binding.status])
  const statusText = isSMS ? {
    queued: '正在排队…',
    running: '正在打开短信登录…',
    waiting_user: '验证码已发送，请输入验证码',
    challenge_required: '抖音要求额外安全验证，当前流程无法自动继续',
    scanned: '已提交验证码，等待平台确认…',
    confirming: '正在验证登录状态…',
    error: `${relogin ? '重新登录' : '绑定'}失败，请重新尝试`,
  }[binding.status] : {
    queued: '正在排队…',
    running: '正在打开登录窗口…',
    waiting_user: awaitingSMSCode ? '验证码已发送，请输入验证码' : '请使用抖音 App 扫描二维码',
    challenge_required: '抖音要求额外安全验证，当前流程无法自动继续',
    scanned: '已扫码，等待平台确认…',
    confirming: '正在验证登录状态…',
    error: `${relogin ? '重新登录' : '绑定'}失败，请重新尝试`,
  }[binding.status]
  return (
    <Card className="mx-6 my-6 overflow-hidden border-primary/20 bg-primary/[0.03]">
      <CardContent className="space-y-5 p-5 sm:p-6">
        {binding.qr && (
          <div className="flex justify-center rounded-xl bg-white p-3 shadow-sm">
            <img src={binding.qr} alt="抖音登录二维码" className="size-44" />
          </div>
        )}
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl ${binding.status === 'challenge_required' ? 'bg-amber-500/15 text-amber-600' : 'bg-primary/10 text-primary'}`}>
            {awaitingSMSCode ? <MessageSquareText className="size-4" /> : binding.status === 'challenge_required' ? <ShieldAlert className="size-4" /> : <RefreshCw className="size-4 animate-spin text-muted-foreground" />}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-sm text-muted-foreground">{statusText}</p>
            {binding.expiresAt && binding.status === 'waiting_user' && (
              <p className="text-xs text-muted-foreground">{awaitingSMSCode || isSMS ? '验证码' : '二维码'}有效期至 {new Date(binding.expiresAt).toLocaleTimeString('zh-CN')}</p>
            )}
            {binding.status === 'error' && <p className="text-xs text-destructive">{isSMS ? '请确认手机号和验证码后重试，原有登录态未改变。' : '请确认抖音 App 已完成扫码并重试，原有登录态未改变。'}</p>}
            {awaitingSMSCode && onSubmitSMSCode && (
              <form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); if (codeDigits.every(Boolean)) void onSubmitSMSCode(code) }}>
                <Label id="sms-verification-code-label">验证码</Label>
                <SMSOtpInput value={codeDigits} onChange={setCodeDigits} disabled={submittingCode} />
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
                  <p className="text-xs text-muted-foreground">请输入短信中的 6 位验证码</p>
                  <div className="flex items-center gap-2">
                    <Button type="submit" disabled={submittingCode || codeDigits.some((digit) => !digit)}>
                      {submittingCode ? <RefreshCw className="animate-spin" /> : <Check />}
                      {submittingCode ? '提交中…' : '验证登录'}
                    </Button>
                    <Button type="button" variant="outline" onClick={onCancel} disabled={submittingCode}>
                      <Ban />
                      {relogin ? '取消重新登录' : '取消绑定'}
                    </Button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
        {!awaitingSMSCode ? <div className="flex justify-end border-t border-border/60 pt-4">
          <Button variant="outline" size="sm" onClick={onCancel}>
            <Ban />
            {relogin ? '取消重新登录' : '取消绑定'}
          </Button>
        </div> : null}
      </CardContent>
    </Card>
  )
}

function SMSOtpInput({ value, onChange, disabled }: { value: string[]; onChange: (value: string[]) => void; disabled?: boolean }) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([])
  const focusInput = (index: number) => inputRefs.current[Math.max(0, Math.min(5, index))]?.focus()
  function setDigits(index: number, raw: string) {
    const digits = raw.replace(/\D/g, '')
    if (!digits) {
      const next = [...value]
      next[index] = ''
      onChange(next)
      return
    }
    const next = [...value]
    digits.slice(0, 6 - index).split('').forEach((digit, offset) => { next[index + offset] = digit })
    onChange(next)
    focusInput(Math.min(5, index + digits.length))
  }
  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !value[index] && index > 0) {
      event.preventDefault()
      const next = [...value]
      next[index - 1] = ''
      onChange(next)
      focusInput(index - 1)
    }
    if (event.key === 'ArrowLeft') { event.preventDefault(); focusInput(index - 1) }
    if (event.key === 'ArrowRight') { event.preventDefault(); focusInput(index + 1) }
  }
  function handlePaste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    const digits = event.clipboardData.getData('text').replace(/\D/g, '')
    if (!digits) return
    event.preventDefault()
    setDigits(index, digits)
  }
  return (
    <div role="group" aria-labelledby="sms-verification-code-label" className="flex gap-2">
      {value.map((digit, index) => (
        <Input
          key={index}
          ref={(node) => { inputRefs.current[index] = node }}
          aria-label={`验证码第 ${index + 1} 位`}
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          pattern="[0-9]*"
          value={digit}
          disabled={disabled}
          onChange={(event) => setDigits(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={(event) => handlePaste(index, event)}
          className="size-11 shrink-0 px-0 text-center text-lg font-semibold tabular-nums sm:size-12"
        />
      ))}
    </div>
  )
}
