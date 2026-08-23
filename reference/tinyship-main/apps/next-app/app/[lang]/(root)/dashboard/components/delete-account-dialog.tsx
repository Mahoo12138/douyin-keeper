'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@libs/react-shared/ui/alert-dialog";
import { Trash2, Loader2 } from "lucide-react";
import { authClientReact } from "@libs/auth/authClient";
import { toast } from "sonner";
import { useTranslation } from "@/hooks/use-translation";

interface DeleteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteAccountDialog({ open, onOpenChange }: DeleteAccountDialogProps) {
  const { t, locale: currentLocale } = useTranslation();
  const router = useRouter();
  const [deleteLoading, setDeleteLoading] = useState(false);

  // 处理账户删除
  const handleDeleteAccount = async () => {
    setDeleteLoading(true);
    
    const { data, error } = await authClientReact.deleteUser({});
    
    if (error) {
      console.error('Failed to delete account:', error);
      toast.error(error.message || t.dashboard.accountManagement.deleteAccount.errors.failed);
      setDeleteLoading(false);
      onOpenChange(false);
      return;
    }
    
    toast.success(t.dashboard.accountManagement.deleteAccount.success);
    // 删除成功后会自动登出，重定向到首页
    router.push(`/${currentLocale}`);
    
    setDeleteLoading(false);
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />
            {t.dashboard.accountManagement.deleteAccount.confirmTitle}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t.dashboard.accountManagement.deleteAccount.confirmDescription}
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
          <p className="text-sm font-medium text-destructive">
            {t.dashboard.accountManagement.deleteAccount.warning}
          </p>
          <ul className="text-sm text-destructive/80 mt-2 space-y-1">
            <li>• {t.dashboard.accountManagement.deleteAccount.consequences.data}</li>
            <li>• {t.dashboard.accountManagement.deleteAccount.consequences.subscriptions}</li>
            <li>• {t.dashboard.accountManagement.deleteAccount.consequences.access}</li>
          </ul>
        </div>
        
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteLoading}>
            {t.dashboard.accountManagement.deleteAccount.form.cancel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDeleteAccount}
            disabled={deleteLoading}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {deleteLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            {t.dashboard.accountManagement.deleteAccount.form.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
} 