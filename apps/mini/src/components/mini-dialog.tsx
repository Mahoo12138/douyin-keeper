import type { ReactNode } from 'react'
import { Text, View } from '@tarojs/components'

import { MiniButton } from './mini-button'

export type MiniDialogTone = 'default' | 'warning' | 'danger'

export function MiniDialog({ open, title, content, children, tone = 'default', confirmText = '确认', cancelText = '取消', busy = false, onConfirm, onCancel }: { open: boolean; title: string; content?: string; children?: ReactNode; tone?: MiniDialogTone; confirmText?: string; cancelText?: string; busy?: boolean; onConfirm: () => void; onCancel: () => void }) {
  if (!open) return null
  return <View className="mini-dialog-mask" onClick={onCancel}>
    <View className={`mini-dialog mini-dialog-${tone}`} onClick={(event) => event.stopPropagation()}>
      <View className="mini-dialog-heading"><Text className="mini-dialog-title">{title}</Text><MiniButton className="mini-dialog-close" disabled={busy} onClick={onCancel}>×</MiniButton></View>
      {content && <Text className="mini-dialog-content">{content}</Text>}
      {children}
      <View className="mini-dialog-actions"><MiniButton className="mini-dialog-cancel" disabled={busy} onClick={onCancel}>{cancelText}</MiniButton><MiniButton className="mini-dialog-confirm" disabled={busy} onClick={onConfirm}>{busy ? '处理中…' : confirmText}</MiniButton></View>
    </View>
  </View>
}
