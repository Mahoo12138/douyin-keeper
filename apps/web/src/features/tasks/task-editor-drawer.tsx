import { Button, Input, Label, Switch, useOverlayBehavior } from '@douyin-keeper/ui-web'
import { X } from 'lucide-react'

import type { Conversation } from '../conversations/conversation-pagination'
import type { Account, MessageTemplate, TaskDraft } from './task-types'
import { SelectField } from '@/components/select-field'
import { taskConversationOptions } from './task-targets'

export function TaskEditorDrawer({
  draft,
  accounts,
  conversations,
  templates,
  templatesHasNextPage,
  templatesLoadingMore,
  onTemplatesLoadMore,
  saving,
  onChange,
  onAccountChange,
  onTemplateApply,
  onClose,
  onSave,
}: {
  draft: TaskDraft
  accounts: Account[]
  conversations: Conversation[]
  templates: MessageTemplate[]
  templatesHasNextPage?: boolean
  templatesLoadingMore?: boolean
  onTemplatesLoadMore?: () => void
  saving: boolean
  onChange: (patch: Partial<TaskDraft>) => void
  onAccountChange: (accountId: string) => void
  onTemplateApply: (templateId: string) => void
  onClose: () => void
  onSave: () => void
}) {
  const drawerRef = useOverlayBehavior<HTMLElement>(true, onClose)
  const conversationOptions = taskConversationOptions(conversations)

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
      <button className="absolute inset-0 cursor-default bg-black/30" aria-label="关闭任务编辑" onClick={onClose} />
      <aside ref={drawerRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="task-editor-title" className="relative flex h-full w-full max-w-xl flex-col bg-background shadow-2xl">
        <div className="flex items-start justify-between border-b p-6">
          <div>
            <h2 id="task-editor-title" className="text-lg font-semibold">{draft.id ? '编辑火花任务' : '新建火花任务'}</h2>
            <p className="mt-1 text-sm text-muted-foreground">配置每日发送时间窗口和消息内容。</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭任务编辑"><X /></Button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          <div className="space-y-1.5">
            <SelectField id="task-account" label="账号" value={draft.accountId} onChange={onAccountChange} disabled={!!draft.id} options={accounts.map((account) => ({ value: account.id, label: account.nickname || '未命名账号' }))} />
            {draft.id && <p className="text-xs text-muted-foreground">已创建任务不能更换账号。</p>}
          </div>
          <div className="space-y-1.5">
            <SelectField id="task-conversation" label="会话" value={draft.conversationId} onChange={(value) => onChange({ conversationId: value })} disabled={!!draft.id} options={conversationOptions} />
            {draft.id && <p className="text-xs text-muted-foreground">已创建任务不能更换会话。</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="task-window-start">开始时间</Label><Input id="task-window-start" type="time" value={draft.windowStart} onChange={(event) => onChange({ windowStart: event.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="task-window-end">结束时间</Label><Input id="task-window-end" type="time" value={draft.windowEnd} onChange={(event) => onChange({ windowEnd: event.target.value })} /></div>
          </div>
          <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">时区：{draft.timezone}。时间窗口不支持跨午夜。</div>
          <SelectField id="task-message-kind" label="消息类型" value={draft.messageKind} onChange={(value) => onChange({ messageKind: value as TaskDraft['messageKind'], message: '' })} options={[{ value: 'text', label: '文字消息' }, { value: 'sticker', label: '贴纸消息' }]} />
          <div className="space-y-1.5">
            <Label htmlFor="task-template">从模板套用</Label>
            <SelectField id="task-template" label="" value="" onChange={onTemplateApply} placeholder="选择一个模板，将内容复制到任务" options={[{ value: '', label: '选择一个模板，将内容复制到任务' }, ...templates.map((template) => ({ value: template.id, label: `${template.name} · ${template.kind === 'sticker' ? '贴纸' : '文字'}` }))]} />
            <p className="text-xs text-muted-foreground">套用后仍可继续编辑，任务保存的是当前内容快照。</p>
            {templatesHasNextPage && <Button type="button" variant="ghost" size="sm" onClick={onTemplatesLoadMore} disabled={templatesLoadingMore}>{templatesLoadingMore ? '加载中…' : '加载更多模板'}</Button>}
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
        </div>
        <div className="flex justify-end gap-2 border-t p-6">
          <Button variant="outline" onClick={onClose} disabled={saving}>取消</Button>
          <Button onClick={onSave} disabled={saving || !draft.conversationId}>{saving ? '保存中…' : '保存任务'}</Button>
        </div>
      </aside>
    </div>
  )
}
