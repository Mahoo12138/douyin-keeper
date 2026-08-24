import { Button, Input, Label, Switch } from '@douyin-keeper/ui-web'
import { X } from 'lucide-react'

import type { Account, Friend, MessageTemplate, TaskDraft } from './task-types'

export function TaskEditorDrawer({
  draft,
  accounts,
  friends,
  templates,
  creatorFirstMessageAllowed,
  creatorFirstMessageLoading,
  saving,
  onChange,
  onAccountChange,
  onTemplateApply,
  onClose,
  onSave,
}: {
  draft: TaskDraft
  accounts: Account[]
  friends: Friend[]
  templates: MessageTemplate[]
  creatorFirstMessageAllowed: boolean
  creatorFirstMessageLoading: boolean
  saving: boolean
  onChange: (patch: Partial<TaskDraft>) => void
  onAccountChange: (accountId: string) => void
  onTemplateApply: (templateId: string) => void
  onClose: () => void
  onSave: () => void
}) {
  const firstMessageToggleDisabled = creatorFirstMessageLoading || (!creatorFirstMessageAllowed && !draft.allowFirstMessage)

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
      <button className="absolute inset-0 cursor-default bg-black/30" aria-label="关闭任务编辑" onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-labelledby="task-editor-title" className="relative flex h-full w-full max-w-xl flex-col bg-background shadow-2xl">
        <div className="flex items-start justify-between border-b p-6">
          <div>
            <h2 id="task-editor-title" className="text-lg font-semibold">{draft.id ? '编辑火花任务' : '新建火花任务'}</h2>
            <p className="mt-1 text-sm text-muted-foreground">配置每日发送时间窗口和消息内容。</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭任务编辑"><X /></Button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          <div className="space-y-1.5">
            <Label htmlFor="task-account">账号</Label>
            <select id="task-account" value={draft.accountId} onChange={(event) => onAccountChange(event.target.value)} disabled={!!draft.id} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring">
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.nickname || '未命名账号'}</option>)}
            </select>
            {draft.id && <p className="text-xs text-muted-foreground">已创建任务不能更换账号。</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-friend">好友</Label>
            <select id="task-friend" value={draft.friendId} onChange={(event) => onChange({ friendId: event.target.value })} disabled={!!draft.id} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring">
              {friends.map((friend) => <option key={friend.id} value={friend.id}>{friend.nickname || friend.display_name}</option>)}
            </select>
            {draft.id && <p className="text-xs text-muted-foreground">已创建任务不能更换好友。</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="task-window-start">开始时间</Label><Input id="task-window-start" type="time" value={draft.windowStart} onChange={(event) => onChange({ windowStart: event.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="task-window-end">结束时间</Label><Input id="task-window-end" type="time" value={draft.windowEnd} onChange={(event) => onChange({ windowEnd: event.target.value })} /></div>
          </div>
          <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">时区：{draft.timezone}。时间窗口不支持跨午夜。</div>
          <div className="space-y-1.5">
            <Label htmlFor="task-message-kind">消息类型</Label>
            <select id="task-message-kind" value={draft.messageKind} onChange={(event) => onChange({ messageKind: event.target.value as TaskDraft['messageKind'], message: '' })} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring">
              <option value="text">文字消息</option>
              <option value="sticker">贴纸消息</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-template">从模板套用</Label>
            <select id="task-template" defaultValue="" onChange={(event) => onTemplateApply(event.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring">
              <option value="">选择一个模板，将内容复制到任务</option>
              {templates.map((template) => <option key={template.id} value={template.id}>{template.name} · {template.kind === 'sticker' ? '贴纸' : '文字'}</option>)}
            </select>
            <p className="text-xs text-muted-foreground">套用后仍可继续编辑，任务保存的是当前内容快照。</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-message">{draft.messageKind === 'sticker' ? '贴纸 ID' : '消息内容'}</Label>
            {draft.messageKind === 'sticker' ? (
              <Input id="task-message" value={draft.message} onChange={(event) => onChange({ message: event.target.value })} maxLength={200} placeholder="输入 Sidecar 返回的稳定 sticker_id" />
            ) : (
              <textarea id="task-message" value={draft.message} onChange={(event) => onChange({ message: event.target.value })} maxLength={500} rows={5} placeholder="输入每天要发送的文字" className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring" />
            )}
            <p className="text-xs text-muted-foreground">{draft.messageKind === 'sticker' ? '仅支持已在账号能力中识别的贴纸 ID，不支持图片 URL 或展示名称。' : '文字会在发送前去除首尾空格。'}</p>
            <p className="text-right text-xs text-muted-foreground">{draft.message.length} / {draft.messageKind === 'sticker' ? 200 : 500}</p>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="pr-4"><Label htmlFor="task-enabled">每日启用</Label><p className="mt-1 text-xs text-muted-foreground">关闭后保留配置，但调度器不会创建发送任务。</p></div>
            <Switch id="task-enabled" checked={draft.enabled} onCheckedChange={(enabled) => onChange({ enabled })} aria-label="每日启用" />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900 dark:bg-amber-950/20">
            <div className="pr-4"><Label htmlFor="task-first-message">允许首聊</Label><p className="mt-1 text-xs text-muted-foreground">{creatorFirstMessageLoading ? '正在检查首聊权益…' : creatorFirstMessageAllowed ? '需要权益与账号能力同时允许；请谨慎开启。' : draft.allowFirstMessage ? '当前方案未授权首聊，可关闭已有配置。' : '当前方案未授权首聊，请先兑换支持首聊的权益。'}</p></div>
            <Switch id="task-first-message" checked={draft.allowFirstMessage} disabled={firstMessageToggleDisabled} onCheckedChange={(enabled) => onChange({ allowFirstMessage: enabled })} aria-label="允许首聊" />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t p-6">
          <Button variant="outline" onClick={onClose} disabled={saving}>取消</Button>
          <Button onClick={onSave} disabled={saving || !draft.friendId}>{saving ? '保存中…' : '保存任务'}</Button>
        </div>
      </aside>
    </div>
  )
}
