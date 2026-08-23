'use client';

import { useState } from "react";
import { Card, CardContent } from "@libs/react-shared/ui/card";
import { Button } from "@libs/react-shared/ui/button";
import { Input } from "@libs/react-shared/ui/input";
import { Label } from "@libs/react-shared/ui/label";
import { Badge } from "@libs/react-shared/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@libs/react-shared/ui/avatar";
import { 
  CreditCard, 
  ShoppingCart,
  User,
  Settings,
  Shield,
  CheckCircle,
  Edit,
  Save,
  X,
  Coins,
  Users,
  Wallet
} from "lucide-react";
import { useTranslation } from "@/hooks/use-translation";
import { SubscriptionCard } from "./subscription-card";
import { CreditsCard } from "./credits-card";
import { OrdersCard } from "./orders-card";
import { LinkedAccountsCard } from "./linked-accounts-card";
import { ChangePasswordDialog } from "./change-password-dialog";
import { DeleteAccountDialog } from "./delete-account-dialog";
import { AffiliateCard } from "@libs/react-shared/components/affiliate-card";
import { WithdrawalCard } from "@libs/react-shared/components/withdrawal-card";
import { cn } from "@/lib/utils";

type TabType = 'profile' | 'subscription' | 'credits' | 'orders' | 'account' | 'affiliate' | 'withdrawal';

interface DashboardTabsProps {
  user: any;
  isEditing: boolean;
  setIsEditing: (editing: boolean) => void;
  editForm: any;
  setEditForm: (form: any) => void;
  updateLoading: boolean;
  handleUpdateProfile: () => void;
  handleCancelEdit: () => void;
  formatDate: (date: string | Date) => string;
  getRoleDisplayName: (role: string) => string;
  getRoleBadgeVariant: (role: string) => any;
}

export function DashboardTabs({ 
  user, 
  isEditing, 
  setIsEditing, 
  editForm, 
  setEditForm, 
  updateLoading, 
  handleUpdateProfile, 
  handleCancelEdit, 
  formatDate, 
  getRoleDisplayName, 
  getRoleBadgeVariant 
}: DashboardTabsProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>('profile');
  const [showChangePasswordDialog, setShowChangePasswordDialog] = useState(false);
  const [showDeleteAccountDialog, setShowDeleteAccountDialog] = useState(false);
  const affiliateEnabled = process.env.NEXT_PUBLIC_AFFILIATE_ENABLED === 'true';

  const tabs = [
    {
      id: 'profile' as TabType,
      label: t.dashboard.tabs.profile.title,
      icon: User,
      description: t.dashboard.tabs.profile.description
    },
    {
      id: 'subscription' as TabType,
      label: t.dashboard.subscription.title,
      icon: CreditCard,
      description: t.dashboard.tabs.subscription.description
    },
    {
      id: 'credits' as TabType,
      label: t.dashboard.tabs.credits.title,
      icon: Coins,
      description: t.dashboard.tabs.credits.description
    },
    {
      id: 'orders' as TabType,
      label: t.dashboard.orders.title,
      icon: ShoppingCart,
      description: t.dashboard.tabs.orders.description
    },
    {
      id: 'account' as TabType,
      label: t.dashboard.tabs.account.title,
      icon: Settings,
      description: t.dashboard.tabs.account.description
    },
    ...(affiliateEnabled ? [
      {
        id: 'affiliate' as TabType,
        label: t.dashboard.affiliate?.title || 'Affiliate',
        icon: Users,
        description: t.dashboard.affiliate?.description || ''
      },
      {
        id: 'withdrawal' as TabType,
        label: t.dashboard.withdrawal?.title || 'Withdrawal',
        icon: Wallet,
        description: t.dashboard.withdrawal?.description || ''
      }
    ] : [])
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'profile':
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Avatar className="w-16 h-16">
                  <AvatarImage src={user?.image} alt={user?.name || t.dashboard.profile.noNameSet} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-xl font-bold">
                    {user?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="text-lg font-medium">{user?.name || t.dashboard.profile.noNameSet}</h3>
                  <p className="text-sm text-muted-foreground">{user?.email}</p>
                  <div className="flex items-center space-x-2 mt-1">
                    <Badge variant={getRoleBadgeVariant(user?.role)}>
                      {getRoleDisplayName(user?.role)}
                    </Badge>
                    {user?.emailVerified && (
                      <div className="flex items-center text-green-600 text-xs">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        {t.dashboard.profile.emailVerified}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {!isEditing && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setIsEditing(true)}
                >
                  <Edit className="w-4 h-4 mr-2" />
                  {t.actions.edit}
                </Button>
              )}
            </div>

            {isEditing ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">{t.dashboard.profile.form.labels.name}</Label>
                    <Input
                      id="name"
                      value={editForm?.name || ''}
                      onChange={(e) => setEditForm({...(editForm || {}), name: e.target.value})}
                      placeholder={t.dashboard.profile.form.placeholders.name}
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">{t.dashboard.profile.form.labels.email}</Label>
                    <Input
                      id="email"
                      type="email"
                      value={user?.email || ''}
                      disabled
                      placeholder={t.dashboard.profile.form.placeholders.email}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {t.dashboard.profile.form.emailReadonly}
                    </p>
                  </div>
                </div>
                <div className="flex space-x-2">
                                      <Button 
                      onClick={handleUpdateProfile}
                      disabled={updateLoading}
                      size="sm"
                    >
                      {updateLoading ? (
                        <>{t.common.loading}</>
                      ) : (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          {t.actions.save}
                        </>
                      )}
                    </Button>
                  <Button 
                    variant="outline" 
                    onClick={handleCancelEdit}
                    size="sm"
                  >
                    <X className="w-4 h-4 mr-2" />
                    {t.actions.cancel}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">
                    {t.dashboard.profile.form.labels.name}
                  </Label>
                  <p className="mt-1">{user?.name || t.dashboard.profile.noNameSet}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">
                    {t.dashboard.profile.form.labels.email}
                  </Label>
                  <p className="mt-1">{user?.email}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">
                    {t.dashboard.account.memberSince}
                  </Label>
                  <p className="mt-1">{user?.createdAt ? formatDate(user.createdAt) : t.common.notAvailable}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">
                    {t.dashboard.profile.role}
                  </Label>
                  <p className="mt-1">{getRoleDisplayName(user?.role || 'user')}</p>
                </div>
              </div>
            )}
          </div>
        );
      case 'subscription':
        return <SubscriptionCard />;
      case 'credits':
        return <CreditsCard />;
      case 'affiliate':
        return <AffiliateCard t={t} />;
      case 'withdrawal':
        return <WithdrawalCard t={t} />;
      case 'orders':
        return <OrdersCard />;
      case 'account':
        return (
          <div className="space-y-6">
            <LinkedAccountsCard />
            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-medium mb-4">{t.dashboard.accountManagement.title}</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <p className="font-medium">{t.dashboard.accountManagement.changePassword.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {t.dashboard.accountManagement.changePassword.description}
                      </p>
                    </div>
                    <Button 
                      variant="outline"
                      onClick={() => setShowChangePasswordDialog(true)}
                    >
                      {t.dashboard.accountManagement.changePassword.button}
                    </Button>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 border rounded-lg border-red-200">
                    <div>
                      <p className="font-medium text-red-600">{t.dashboard.accountManagement.deleteAccount.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {t.dashboard.accountManagement.deleteAccount.description}
                      </p>
                    </div>
                    <Button 
                      variant="destructive"
                      onClick={() => setShowDeleteAccountDialog(true)}
                    >
                      {t.dashboard.accountManagement.deleteAccount.button}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <ChangePasswordDialog 
              open={showChangePasswordDialog}
              onOpenChange={setShowChangePasswordDialog}
            />
            <DeleteAccountDialog 
              open={showDeleteAccountDialog}
              onOpenChange={setShowDeleteAccountDialog}
            />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Card className="p-0">
      <CardContent className="p-0">
        <div className="flex min-h-[600px] overflow-hidden">
          {/* 左侧导航 - 固定宽度 */}
          <div className="w-64 flex-shrink-0 border-r bg-muted/30">
            <div className="p-4">
              <nav className="space-y-1">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        "w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all",
                        activeTab === tab.id
                          ? "bg-background text-foreground shadow-sm border"
                          : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                      )}
                    >
                      <Icon className="h-5 w-5 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{tab.label}</div>
                        {tab.description && (
                          <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {tab.description}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>

          {/* 右侧内容 - 可滚动区域 */}
          <div className="flex-1 overflow-auto">
            <div className="p-6">
              {renderContent()}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
