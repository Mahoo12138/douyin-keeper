import { Badge, Button, Switch, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@douyin-keeper/ui-web'
import { Play, Settings2, Trash2 } from 'lucide-react'

import type { Account, Friend, Task } from './task-types'

export function TaskTable({
  tasks,
  accounts,
  friends,
  busyTaskId,
  onToggle,
  onEdit,
  onRun,
  onDelete,
}: {
  tasks: Task[]
  accounts: Account[]
  friends: Map<string, Friend>
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
          <TableHead className="pl-5">好友</TableHead>
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
          const friend = friends.get(task.friend_id)
          const busy = busyTaskId === task.id
          const identityLabel = friend?.platform_identity_status === 'resolved'
            ? '身份已确认'
            : friend?.short_id
              ? `抖音号 ${friend.short_id}`
              : '身份信息待同步'
          return (
            <TableRow key={task.id}>
              <TableCell className="pl-5">
                <div className="min-w-[155px]">
                  <div className="font-medium">{friend?.nickname || friend?.display_name || '好友'}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{identityLabel}</div>
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm">{account?.nickname || '账号'}</TableCell>
              <TableCell className="whitespace-nowrap text-sm">
                <div>{task.window_start.slice(0, 5)}–{task.window_end.slice(0, 5)}</div>
                <div className="mt-1 text-xs text-muted-foreground">{task.timezone}</div>
              </TableCell>
              <TableCell className="max-w-[220px]">
                <div className="truncate text-sm">{task.message.body || (task.message.kind === 'sticker' ? '贴纸消息' : '未填写内容')}</div>
                {task.allow_first_message && <div className="mt-1 text-xs text-amber-600">允许首聊</div>}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <Badge variant={task.enabled ? 'success' : 'muted'}>{task.enabled ? '每日启用' : '已停用'}</Badge>
                  <Switch checked={task.enabled} disabled={busy} onCheckedChange={(enabled) => onToggle(task, enabled)} aria-label={`${friend?.nickname || '好友'}任务开关`} />
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
                    立即执行
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
