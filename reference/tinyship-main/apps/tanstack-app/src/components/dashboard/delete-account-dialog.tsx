import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@libs/react-shared/ui/alert-dialog'
import { Trash2, Loader2 } from 'lucide-react'
import { authClientReact } from '@libs/auth/authClient'
import { toast } from 'sonner'
import { useTranslation } from '@/hooks/use-translation'

interface DeleteAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DeleteAccountDialog({ open, onOpenChange }: DeleteAccountDialogProps) {
  const { t, locale: currentLocale } = useTranslation()
  const [deleteLoading, setDeleteLoading] = useState(false)

  const handleDeleteAccount = async () => {
    setDeleteLoading(true)
    const { data, error } = await authClientReact.deleteUser({})
    if (error) {
      console.error('Failed to delete account:', error)
      toast.error(error.message || t.dashboard.accountManagement.deleteAccount.errors.failed)
      setDeleteLoading(false)
      onOpenChange(false)
      return
    }
    toast.success(t.dashboard.accountManagement.deleteAccount.success)
    window.location.href = `/${currentLocale}`
    setDeleteLoading(false)
    onOpenChange(false)
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-destructive flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            {t.dashboard.accountManagement.deleteAccount.confirmTitle}
          </AlertDialogTitle>
          <AlertDialogDescription>{t.dashboard.accountManagement.deleteAccount.confirmDescription}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="bg-destructive/10 border-destructive/20 rounded-lg border p-4">
          <p className="text-destructive text-sm font-medium">{t.dashboard.accountManagement.deleteAccount.warning}</p>
          <ul className="text-destructive/80 mt-2 space-y-1 text-sm">
            <li>• {t.dashboard.accountManagement.deleteAccount.consequences.data}</li>
            <li>• {t.dashboard.accountManagement.deleteAccount.consequences.subscriptions}</li>
            <li>• {t.dashboard.accountManagement.deleteAccount.consequences.access}</li>
          </ul>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteLoading}>{t.dashboard.accountManagement.deleteAccount.form.cancel}</AlertDialogCancel>
          <AlertDialogAction onClick={handleDeleteAccount} disabled={deleteLoading} className="bg-destructive text-white hover:bg-destructive/90">
            {deleteLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            {t.dashboard.accountManagement.deleteAccount.form.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
