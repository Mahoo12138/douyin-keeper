'use client';

import { useEffect, useState } from "react";
import { Button } from "@libs/react-shared/ui/button";
import { Badge } from "@libs/react-shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@libs/react-shared/ui/card";
import { Progress } from "@libs/react-shared/ui/progress";
import { 
  CreditCard, 
  CalendarIcon,
  ExternalLink,
  Package,
  Loader2
} from "lucide-react";
import Link from "next/link";
import { useTranslation } from "@/hooks/use-translation";
import { toast } from "sonner";
import { config } from "@config";

interface SubscriptionCardProps {
  // Props interface for subscription data if needed
}

export function SubscriptionCard({}: SubscriptionCardProps) {
  const { t, locale: currentLocale } = useTranslation();
  const [subscriptionData, setSubscriptionData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    async function fetchSubscriptionData() {
      try {
        const subscriptionResponse = await fetch('/api/subscription/status');
        if (subscriptionResponse.ok) {
          const data = await subscriptionResponse.json();
          setSubscriptionData(data);
        }
      } catch (error) {
        console.error('Failed to fetch subscription data', error);
      } finally {
        setLoading(false);
      }
    }

    fetchSubscriptionData();
  }, []);

  // 打开客户门户（支持多个支付提供商）
  const openCustomerPortal = async (provider?: string) => {
    try {
      setRedirecting(true);
      const returnUrl = `${window.location.origin}/${currentLocale}/dashboard`;
      
      const response = await fetch('/api/subscription/portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          returnUrl,
          provider // 可选：指定支付提供商，如果不指定则自动检测
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '无法打开客户门户');
      }
      
      const { url } = await response.json();
      
      // 重定向到客户门户
      window.location.href = url;
    } catch (error) {
      console.error('打开客户门户失败:', error);
      toast.error(t.common.unexpectedError);
      setRedirecting(false);
    }
  };



  // 获取计划名称
  const getPlanName = (planId: string) => {
    const plan = config.payment.plans[planId as keyof typeof config.payment.plans];
    if (!plan) return planId; // 如果找不到计划，则返回 planId
    
    // 使用当前语言的翻译
    if (plan.i18n && plan.i18n[currentLocale]) {
      return plan.i18n[currentLocale].name;
    }
    
    // 如果没有当前语言的翻译，则使用默认名称
    return plan.i18n[currentLocale]?.name || planId;
  };

  // 格式化日期
  const formatDate = (dateString: string | Date) => {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    return date.toLocaleDateString(currentLocale === 'zh-CN' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // 计算订阅期间已经过去的时间比例
  const calculateProgress = () => {
    if (!subscriptionData?.subscription) return 0;
    
    const start = new Date(subscriptionData.subscription.periodStart).getTime();
    const end = new Date(subscriptionData.subscription.periodEnd).getTime();
    const now = Date.now();
    
    if (now >= end) return 100;
    if (now <= start) return 0;
    
    return Math.floor(((now - start) / (end - start)) * 100);
  };



  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  // 如果用户没有有效订阅，显示升级选项
  if (!subscriptionData?.hasSubscription && !subscriptionData?.isLifetime) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t.subscription.noSubscription.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4">{t.subscription.noSubscription.description}</p>
            <Button asChild>
              <Link href={`/${currentLocale}/pricing`}>{t.subscription.noSubscription.viewPlans}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isLifetime = subscriptionData.isLifetime;
  const sub = subscriptionData.subscription;
  const planId = sub?.planId || '';

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.subscription.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 订阅概览部分 */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Package className="h-5 w-5 mr-2 text-primary" />
              <span className="font-medium">{t.subscription.overview.planType}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-primary">
                {isLifetime ? t.dashboard.subscription.status.lifetime : getPlanName(planId)}
              </span>
              {!isLifetime && sub && (
                <span className="px-2 py-1 rounded-full border text-xs">
                  {sub.paymentType === 'recurring' 
                    ? t.dashboard.subscription.paymentType.recurring 
                    : t.dashboard.subscription.paymentType.oneTime}
                </span>
              )}
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <CreditCard className="h-5 w-5 mr-2 text-primary" />
              <span className="font-medium">{t.subscription.overview.status}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 rounded-full bg-primary text-primary-foreground text-xs font-medium">
                {t.subscription.overview.active}
              </span>
              {sub?.cancelAtPeriodEnd && (
                <span className="px-2 py-1 rounded-full  bg-accent text-xs">
                  {t.dashboard.subscription.status.cancelAtPeriodEnd}
                </span>
              )}
            </div>
          </div>
          
          {!isLifetime && sub && (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <CalendarIcon className="h-5 w-5 mr-2 text-primary" />
                  <span className="font-medium">{t.subscription.overview.startDate}</span>
                </div>
                <span>{formatDate(sub.periodStart)}</span>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <CalendarIcon className="h-5 w-5 mr-2 text-primary" />
                  <span className="font-medium">{t.subscription.overview.endDate}</span>
                </div>
                <span>{formatDate(sub.periodEnd)}</span>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{t.subscription.overview.progress}</span>
                  <span>{calculateProgress()}%</span>
                </div>
                <Progress value={calculateProgress()} className="h-2" />
              </div>
            </>
          )}
        </div>

        {(sub?.stripeCustomerId || sub?.creemCustomerId || sub?.dodoCustomerId) && (
          <div className="border-t pt-6">
            <h3 className="text-lg font-medium mb-4">{t.subscription.management.title}</h3>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground mb-4">
                {t.subscription.management.description}
              </p>
              <div className="flex gap-3">

                  <Button 
                    variant="default" 
                    className="flex items-center gap-1"
                    onClick={() => openCustomerPortal()}
                    disabled={redirecting}
                  >
                    <ExternalLink className="h-4 w-4" />
                    {redirecting ? t.subscription.management.redirecting : t.subscription.management.manageSubscription}
                  </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
} 