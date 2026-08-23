'use client'

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useEffect, useState } from 'react';

interface RevenueChartProps {
  data: Array<{
    month: string;
    revenue: number;
    orders: number;
  }>;
  labels: {
    revenue: string;
    orders: string;
  };
}

// Format number display
function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

// Revenue chart tooltip
const RevenueTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card p-3 border border-border rounded-lg shadow-lg">
        <p className="text-sm font-medium text-card-foreground">{`${label}`}</p>
        <p className="text-sm text-chart-1">
          {`¥${payload[0]?.value?.toLocaleString() || 0}`}
        </p>
      </div>
    );
  }
  return null;
};

// Orders chart tooltip
const OrdersTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card p-3 border border-border rounded-lg shadow-lg">
        <p className="text-sm font-medium text-card-foreground">{`${label}`}</p>
        <p className="text-sm text-chart-1">
          {payload[0]?.value?.toLocaleString() || 0}
        </p>
      </div>
    );
  }
  return null;
};

export default function RevenueChart({ data, labels }: RevenueChartProps) {
  const [isClient, setIsClient] = useState(false);
  const [activeTab, setActiveTab] = useState<'revenue' | 'orders'>('revenue');

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Show placeholder during server-side rendering
  if (!isClient) {
    return (
      <div className="h-80 flex items-center justify-center bg-muted/30 rounded-lg">
        <div className="text-center">
          <div className="animate-pulse">
            <div className="h-4 bg-muted-foreground/30 rounded w-32 mx-auto mb-2"></div>
            <div className="h-3 bg-muted-foreground/20 rounded w-24 mx-auto"></div>
          </div>
        </div>
      </div>
    );
  }

  // Get CSS variable values
  const getComputedColor = (variable: string) => {
    if (typeof window === 'undefined') return '#000';
    return getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  };

  const chart1Color = getComputedColor('--chart-1');
  const borderColor = getComputedColor('--border');
  const mutedForegroundColor = getComputedStyle(document.documentElement).getPropertyValue('--muted-foreground').trim();

  return (
    <div>
      {/* Tab Switcher */}
      <div className="flex items-center justify-end mb-4">
        <div className="inline-flex items-center p-1 bg-muted rounded-lg">
          <button
            onClick={() => setActiveTab('revenue')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${
              activeTab === 'revenue'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {labels.revenue}
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${
              activeTab === 'orders'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {labels.orders}
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorChart" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={chart1Color} stopOpacity={0.3}/>
                <stop offset="95%" stopColor={chart1Color} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={borderColor} vertical={false} />
            <XAxis 
              dataKey="month" 
              stroke={mutedForegroundColor}
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis 
              stroke={mutedForegroundColor}
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => activeTab === 'revenue' ? `¥${formatNumber(value)}` : formatNumber(value)}
            />
            <Tooltip content={activeTab === 'revenue' ? <RevenueTooltip /> : <OrdersTooltip />} />
            <Area
              type="monotone"
              dataKey={activeTab}
              stroke={chart1Color}
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorChart)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
} 