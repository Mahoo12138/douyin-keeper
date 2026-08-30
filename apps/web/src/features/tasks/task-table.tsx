import { Badge, Button, Switch, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@douyin-keeper/ui-web'
import { Play, Settings2, Trash2 } from 'lucide-react'

import type { Conversation } from '../conversations/conversation-pagination'
import type { Account, Task } from './task-types'

export function TaskTable({
  tasks,
  accounts,
  conversations,
  busyTaskId,
  onToggle,
  onEdit,
  onRun,
  onDelete,
}: {
  tasks: Task[]
  accounts: Account[]
  conversations: Map<string, Conversation>
  busyTaskId: string | null
  onToggle: (task: Task, enabled: boolean) => void
  onEdit: (task: Task) => void
  onRun: (task: Task) => void
  onDelete: (task: Task) => void
}) {
  return (
    <Table className="min-w-[960px]">
      <TableHeader>
        <TableRow>
          <TableHead className="pl-5">会话</TableHead>
          <TableHead>账号</TableHead>
          <TableHead>时间窗口</TableHead>
          <TableHead>内容</TableHead>
          <TableHead>状态</TableHead>
          <TableHead className="pr-5 text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tasks.map((task) => {
          const account = accounts.find((item) => item.id === task.account_id)
          const conversation = conversations.get(task.friend_id)
          const busy = busyTaskId === task.id
          const conversationTypeLabel = conversation?.conversation_type === 'group' ? '群聊会话' : '直接会话'
          return (
            <TableRow key={task.id}>
              <TableCell className="pl-5">
                <div className="min-w-[155px]">
                  <div className="font-medium">{conversation?.friend_nickname || conversation?.friend_display_name || '会话'}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{conversationTypeLabel}</div>
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm">{account?.nickname || '账号'}</TableCell>
              <TableCell className="whitespace-nowrap text-sm">
                <div>{task.window_start.slice(0, 5)}–{task.window_end.slice(0, 5)}</div>
                <div className="mt-1 text-xs text-muted-foreground">{task.timezone}</div>
              </TableCell>
              <TableCell className="max-w-[220px]">
                <div className="truncate text-sm">{task.message.body || (task.message.kind === 'sticker' ? '贴纸消息' : '未填写内容')}</div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <Badge variant={task.enabled ? 'success' : 'muted'}>{task.enabled ? '每日启用' : '已停用'}</Badge>
                  <Switch checked={task.enabled} disabled={busy} onCheckedChange={(enabled) => onToggle(task, enabled)} aria-label={`${conversation?.friend_nickname || conversation?.friend_display_name || '会话'}任务开关`} />
                </div>
              </TableCell>
              <TableCell className="pr-5">
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="sm" onClick={() => onEdit(task)} disabled={busy}>
                    <Settings2 />
                    编辑
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onRun(task)} disabled={busy}>
                    <Play />
                    {busy ? '发送中…' : '立即执行'}
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => onDelete(task)} disabled={busy}>
                    <Trash2 />
                    删除
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
