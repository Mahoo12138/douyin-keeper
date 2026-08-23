'use client';

import { useEffect, useState } from "react";
import { Button } from "@libs/react-shared/ui/button";
import { Badge } from "@libs/react-shared/ui/badge";
import { 
  ShoppingCart, 
  Calendar, 
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  RotateCcw,
  ExternalLink,
  User
} from "lucide-react";
import Link from "next/link";
import { useTranslation } from "@/hooks/use-translation";
import { config } from "@config";

interface AdminOrder {
  id: string;
  userId: string;
  amount: string;
  currency: string;
  planId: string;
  status: string;
  provider: string;
  providerOrderId?: string | null;
  metadata?: any;
  createdAt: string | Date;
  updatedAt?: string | Date;
  userName?: string | null;
  userEmail?: string | null;
}

interface AdminOrdersCardProps {
  limit?: number;
}

export function AdminOrdersCard({ limit = 10 }: AdminOrdersCardProps) {
  const { t, locale: currentLocale } = useTranslation();
  const [ordersData, setOrdersData] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    async function fetchOrdersData() {
      try {
        const ordersResponse = await fetch(`/api/admin/orders?limit=${limit}&offset=0`);
        if (ordersResponse.ok) {
          const data = await ordersResponse.json();
          setOrdersData(data.orders || []);
          setTotal(data.total || 0);
        } else {
          setError('Failed to fetch orders');
        }
      } catch (error) {
        console.error('Failed to fetch orders data', error);
        setError('Failed to fetch orders');
      } finally {
        setLoading(false);
      }
    }

    fetchOrdersData();
  }, [limit]);

  // 格式化日期
  const formatDate = (dateString: string | Date) => {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    return date.toLocaleDateString(currentLocale === 'zh-CN' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // 格式化金额
  const formatAmount = (amount: string, currency: string) => {
    const numAmount = parseFloat(amount);
    return `${currency === 'CNY' ? '¥' : '$'}${numAmount.toLocaleString()}`;
  };

  // 获取计划名称
  const getPlanName = (planId: string) => {
    const plan = config.payment.plans[planId as keyof typeof config.payment.plans];
    return plan?.i18n[currentLocale]?.name || planId;
  };

  // 获取订单状态显示
  const getOrderStatusDisplay = (status: string) => {
    switch (status) {
      case 'paid':
        return {
          text: t.dashboard.orders.status.paid,
          variant: 'default' as const,
          icon: CheckCircle
        };
      case 'pending':
        return {
          text: t.dashboard.orders.status.pending,
          variant: 'secondary' as const,
          icon: Clock
        };
      case 'failed':
        return {
          text: t.dashboard.orders.status.failed,
          variant: 'destructive' as const,
          icon: XCircle
        };
      case 'refunded':
        return {
          text: t.dashboard.orders.status.refunded,
          variant: 'outline' as const,
          icon: RotateCcw
        };
      case 'canceled':
        return {
          text: t.dashboard.orders.status.canceled,
          variant: 'secondary' as const,
          icon: XCircle
        };
      default:
        return {
          text: status,
          variant: 'outline' as const,
          icon: AlertCircle
        };
    }
  };

  // 获取支付方式显示
  const getProviderDisplay = (provider: string) => {
    switch (provider) {
      case 'stripe':
        return t.dashboard.orders.provider.stripe;
      case 'wechat':
        return t.dashboard.orders.provider.wechat;
      default:
        return provider;
    }
  };

  if (loading) {
    return (
      <div className="bg-card rounded-lg shadow-sm border border-border">
        <div className="p-6 border-b border-border">
          <h3 className="text-lg font-semibold text-card-foreground flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            {t.dashboard.orders.title}
          </h3>
        </div>
        <div className="p-6">
          <div className="animate-pulse">
            <div className="h-4 bg-muted rounded w-32 mb-2"></div>
            <div className="h-4 bg-muted rounded w-48"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card rounded-lg shadow-sm border border-border">
        <div className="p-6 border-b border-border">
          <h3 className="text-lg font-semibold text-card-foreground flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            {t.dashboard.orders.title}
          </h3>
        </div>
        <div className="p-6">
          <div className="text-destructive text-sm">
            {error}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg shadow-sm border border-border">
      <div className="p-6 border-b border-border flex items-center justify-between">
        <h3 className="text-lg font-semibold text-card-foreground flex items-center gap-2">
          <ShoppingCart className="h-5 w-5" />
          {t.dashboard.orders.title}
        </h3>
        <div className="text-sm text-muted-foreground">
          {t.admin.dashboard.recentOrders.total}: {total}
        </div>
      </div>
      
      {ordersData.length === 0 ? (
        <div className="p-6">
          <p className="text-muted-foreground text-center">
            {t.dashboard.orders.noOrdersDescription}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t.admin.dashboard.recentOrders.orderId}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t.admin.dashboard.recentOrders.customer}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t.admin.dashboard.recentOrders.plan}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t.admin.dashboard.recentOrders.amount}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t.admin.dashboard.recentOrders.provider}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t.admin.dashboard.recentOrders.status}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t.admin.dashboard.recentOrders.time}
                </th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {ordersData.map((order) => {
                const statusDisplay = getOrderStatusDisplay(order.status);
                return (
                  <tr key={order.id} className="hover:bg-muted/50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-card-foreground">
                      #{order.id.slice(-8)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        <div>
                          <div className="font-medium text-card-foreground">
                            {order.userName || 'N/A'}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {order.userEmail}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                      {getPlanName(order.planId)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-card-foreground">
                      {formatAmount(order.amount, order.currency)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground capitalize">
                      {getProviderDisplay(order.provider)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={statusDisplay.variant}>
                        <statusDisplay.icon className="h-3 w-3 mr-1" />
                        {statusDisplay.text}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                      {formatDate(order.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          
          {/* 查看更多按钮 */}
          <div className="p-6 border-t border-border">
            <Button variant="outline" asChild className="w-full">
              <Link href={`/${currentLocale}/admin/orders`}>
                {t.dashboard.orders.viewAllOrders}
                <ExternalLink className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
} 