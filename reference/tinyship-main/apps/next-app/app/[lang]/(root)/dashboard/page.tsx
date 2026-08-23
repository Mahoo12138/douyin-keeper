'use client';

import { useTranslation } from "@/hooks/use-translation";
import { useEffect, useState } from "react";
import { authClientReact } from "@libs/auth/authClient";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DashboardTabs } from "./components/dashboard-tabs";
import { Loader2 } from "lucide-react";
import { useReferralClaim } from "@libs/react-shared/hooks/use-referral-claim";

export default function DashboardPage() {
  const { t, locale: currentLocale } = useTranslation();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    image: ''
  });
  const [updateLoading, setUpdateLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const { 
    data: session, 
    isPending
  } = authClientReact.useSession();
  
  const user = session?.user;

  useReferralClaim({
    bonusFailed: t.dashboard.affiliate.bonusFailed,
    claimFailed: t.dashboard.affiliate.claimFailed,
  });

  useEffect(() => {
    if (user) {
      setEditForm({
        name: user.name || '',
        image: user.image || ''
      });
      setLoading(false);
    } else if (!isPending) {
      setLoading(false);
      // Redirect to signin page when user is not authenticated
      router.push(`/${currentLocale}/signin`);
    }
  }, [user, refreshKey, isPending, router, currentLocale]);

  // 格式化日期
  const formatDate = (dateString: string | Date) => {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    return date.toLocaleDateString(currentLocale === 'zh-CN' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // 获取用户角色显示名称
  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case 'admin':
        return t.dashboard.roles.admin;
      case 'user':
        return t.dashboard.roles.user;
      default:
        return role;
    }
  };

  // 获取用户角色徽章颜色
  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin':
        return 'destructive';
      case 'user':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  // 处理用户信息更新
  const handleUpdateProfile = async () => {
    if (!user) return;
    
    setUpdateLoading(true);
    
    const { data, error } = await authClientReact.updateUser({
      name: editForm.name.trim() || undefined,
      image: editForm.image.trim() || undefined,
    });
    
    if (error) {
      console.error('Failed to update profile:', error);
      toast.error(error.message || t.dashboard.profile.updateError);
      setUpdateLoading(false);
      return;
    }
    
    setIsEditing(false);
    toast.success(t.dashboard.profile.updateSuccess);
    
    // 强制刷新组件状态以确保显示最新数据
    setRefreshKey(prev => prev + 1);
    
    // 主动获取最新会话数据
    setTimeout(async () => {
      try {
        await authClientReact.getSession();
      } catch (error) {
        console.error('Failed to refresh session:', error);
      }
    }, 100);
    
    setUpdateLoading(false);
  };

  // 取消编辑
  const handleCancelEdit = () => {
    setEditForm({
      name: user?.name || '',
      image: user?.image || ''
    });
    setIsEditing(false);
  };

  if (isPending || loading) {
    return (
      <div className="container py-8">
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="container py-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* 页面标题 */}
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">
            {t.dashboard.title}
          </h1>
          <p className="text-muted-foreground mt-2">
            {t.dashboard.description}
          </p>
        </div>

        {/* 仪表盘标签页 */}
        <DashboardTabs
          user={user}
          isEditing={isEditing}
          setIsEditing={setIsEditing}
          editForm={editForm}
          setEditForm={setEditForm}
          updateLoading={updateLoading}
          handleUpdateProfile={handleUpdateProfile}
          handleCancelEdit={handleCancelEdit}
          formatDate={formatDate}
          getRoleDisplayName={getRoleDisplayName}
          getRoleBadgeVariant={getRoleBadgeVariant}
        />
      </div>
    </div>
  );
} 
