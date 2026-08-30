import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@douyin-keeper/ui-web'

type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  impact?: string
  confirmLabel: string
  cancelLabel?: string
  pending?: boolean
  confirmVariant?: 'default' | 'destructive'
  onConfirm: () => void
}

export function ConfirmDialog({ open, onOpenChange, title, description, impact, confirmLabel, cancelLabel = '取消', pending = false, confirmVariant = 'default', onConfirm }: ConfirmDialogProps) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>{impact && <div className="mx-6 my-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-sm leading-6 text-muted-foreground">{impact}</div>}<DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>{cancelLabel}</Button><Button variant={confirmVariant} onClick={onConfirm} disabled={pending}>{pending ? '处理中…' : confirmLabel}</Button></DialogFooter></DialogContent></Dialog>
}
