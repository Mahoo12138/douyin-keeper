'use client';

import { useEffect, useState } from "react";
import { Badge } from "@libs/react-shared/ui/badge";
import { 
  Link as LinkIcon,
  Mail,
  Key
} from "lucide-react";
import { authClientReact } from "@libs/auth/authClient";
import { useTranslation } from "@/hooks/use-translation";

interface LinkedAccountsCardProps {
  // Props interface if needed
}

export function LinkedAccountsCard({}: LinkedAccountsCardProps) {
  const { t, locale: currentLocale } = useTranslation();
  const [accountsData, setAccountsData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAccountsData() {
      const { data, error } = await authClientReact.listAccounts();
      
      if (error) {
        console.error('Failed to fetch user accounts', error);
        setAccountsData([]);
        setLoading(false);
        return;
      }
      
      if (data) {
        setAccountsData(data);
      } else {
        setAccountsData([]);
      }
      
      setLoading(false);
    }

    fetchAccountsData();
  }, []);

  // 格式化日期
  const formatDate = (dateString: string | Date) => {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    return date.toLocaleDateString(currentLocale === 'zh-CN' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // 获取提供商显示名称
  const getProviderDisplayName = (providerId: string) => {
    const providerKey = providerId.toLowerCase() as keyof typeof t.dashboard.linkedAccounts.providers;
    return t.dashboard.linkedAccounts.providers[providerKey] || providerId;
  };

  // 获取提供商图标
  const getProviderIcon = (providerId: string) => {
    switch (providerId.toLowerCase()) {
      case 'credential':
        return Mail;
      case 'phone-number':
        return Key;
      default:
        return LinkIcon;
    }
  };

  if (loading) {
    return (
      <div>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <LinkIcon className="h-5 w-5" />
          {t.dashboard.linkedAccounts.title}
        </h3>
        <div className="animate-pulse space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 bg-muted rounded-full"></div>
                <div>
                  <div className="h-4 bg-muted rounded w-20 mb-1"></div>
                  <div className="h-3 bg-muted rounded w-32"></div>
                </div>
              </div>
              <div className="h-6 bg-muted rounded w-16"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <LinkIcon className="h-5 w-5" />
        {t.dashboard.linkedAccounts.title}
      </h3>
      <div className="space-y-3">
        {accountsData.length > 0 ? (
          accountsData.map((account) => {
            const ProviderIcon = getProviderIcon(account.providerId);
            return (
              <div
                key={account.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-muted/20"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-background border">
                    <ProviderIcon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-medium">
                      {getProviderDisplayName(account.providerId)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {t.dashboard.linkedAccounts.connectedAt} {formatDate(account.createdAt)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {t.dashboard.linkedAccounts.connected}
                  </Badge>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <LinkIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>
              {t.dashboard.linkedAccounts.noLinkedAccounts}
            </p>
          </div>
        )}
      </div>
    </div>
  );
} 