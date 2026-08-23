'use client';

import { useEffect, useState } from "react";
import { Button } from "@libs/react-shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@libs/react-shared/ui/card";
import { Badge } from "@libs/react-shared/ui/badge";
import { 
  Coins, 
  TrendingUp,
  TrendingDown,
  History,
  ArrowRight,
  Loader2,
  Gift,
  RotateCcw
} from "lucide-react";
import Link from "next/link";
import { useTranslation } from "@/hooks/use-translation";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@libs/react-shared/ui/pagination";

interface CreditStatus {
  credits: {
    balance: number;
    totalPurchased: number;
    totalConsumed: number;
  };
  hasSubscription: boolean;
  canAccess: boolean;
}

interface CreditTransaction {
  id: string;
  type: string;
  amount: string;
  balance: string;
  description: string | null;
  createdAt: string;
}


const PAGE_SIZE = 10;

export function CreditsCard() {
  const { t, locale: currentLocale } = useTranslation();
  const [creditData, setCreditData] = useState<CreditStatus | null>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalTransactions, setTotalTransactions] = useState(0);

  // Fetch transactions for a specific page
  const fetchTransactions = async (page: number) => {
    setLoadingTransactions(true);
    try {
      const response = await fetch(`/api/credits/transactions?page=${page}&limit=${PAGE_SIZE}`);
      if (response.ok) {
        const data = await response.json();
        setTransactions(data.transactions || []);
        setTotalPages(data.totalPages || 1);
        setTotalTransactions(data.total || 0);
        setCurrentPage(data.page || 1);
      }
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
    } finally {
      setLoadingTransactions(false);
    }
  };

  useEffect(() => {
    async function fetchCreditData() {
      try {
        const statusResponse = await fetch('/api/credits/status');
        if (statusResponse.ok) {
          const data = await statusResponse.json();
          setCreditData(data);
        }
        
        // Fetch first page of transactions
        await fetchTransactions(1);
      } catch (error) {
        console.error('Failed to fetch credit data', error);
      } finally {
        setLoading(false);
      }
    }

    fetchCreditData();
  }, []);

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(currentLocale === 'zh-CN' ? 'zh-CN' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get transaction type display
  const getTransactionTypeDisplay = (type: string) => {
    const types = t.dashboard.credits.types as Record<string, string>;
    const typeMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof TrendingUp }> = {
      purchase: { 
        label: types.purchase || 'Purchase', 
        variant: 'default',
        icon: TrendingUp
      },
      bonus: { 
        label: types.bonus || 'Bonus', 
        variant: 'secondary',
        icon: Gift
      },
      consumption: { 
        label: types.consumption || 'Used', 
        variant: 'outline',
        icon: TrendingDown
      },
      refund: { 
        label: types.refund || 'Refund', 
        variant: 'secondary',
        icon: RotateCcw
      },
      adjustment: { 
        label: types.adjustment || 'Adjustment', 
        variant: 'secondary',
        icon: History
      }
    };
    return typeMap[type] || { 
      label: type, 
      variant: 'outline' as const,
      icon: History
    };
  };

  // Get translated description for type codes
  const getDescriptionDisplay = (description: string | null) => {
    if (!description) return '-';
    
    // Check if it's a known type code
    const descriptions = t.dashboard.credits.descriptions as Record<string, string> | undefined;
    if (descriptions && descriptions[description]) {
      return descriptions[description];
    }
    
    // Return as-is if not a known code (legacy data)
    return description;
  };

  // Handle page change - fetch new data from server
  const handlePageChange = async (page: number) => {
    if (page >= 1 && page <= totalPages && page !== currentPage) {
      await fetchTransactions(page);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-primary" />
            {t.dashboard.credits.title}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Coins className="h-5 w-5 text-primary" />
          {t.dashboard.credits.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Stats - 3 columns in a row */}
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 bg-muted/50 rounded-lg text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Coins className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-muted-foreground">
                {t.dashboard.credits.available}
              </span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {creditData?.credits.balance.toLocaleString() || 0}
            </p>
          </div>
          <div className="p-4 bg-muted/50 rounded-lg text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">
                {t.dashboard.credits.totalPurchased}
              </span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {creditData?.credits.totalPurchased.toLocaleString() || 0}
            </p>
          </div>
          <div className="p-4 bg-muted/50 rounded-lg text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">
                {t.dashboard.credits.totalConsumed}
              </span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {creditData?.credits.totalConsumed.toLocaleString() || 0}
            </p>
          </div>
        </div>

        {/* Transactions Table */}
        {transactions.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <History className="h-4 w-4" />
              {t.dashboard.credits.recentTransactions}
            </h4>
            <div className="rounded-md border">
              <table className="w-full table-fixed">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase w-[90px]">
                      {t.dashboard.credits.table?.type || 'Type'}
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">
                      {t.dashboard.credits.table?.description || 'Description'}
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase w-[80px]">
                      {t.dashboard.credits.table?.amount || 'Amount'}
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase w-[120px]">
                      {t.dashboard.credits.table?.time || 'Time'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {transactions.map((tx) => {
                    const typeInfo = getTransactionTypeDisplay(tx.type);
                    const TypeIcon = typeInfo.icon;
                    const amount = parseFloat(tx.amount);
                    
                    return (
                      <tr key={tx.id} className={`hover:bg-muted/50 ${loadingTransactions ? 'opacity-50' : ''}`}>
                        <td className="px-3 py-3">
                          <Badge variant={typeInfo.variant} className="text-xs">
                            <TypeIcon className="h-3 w-3 mr-1" />
                            {typeInfo.label}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 text-sm text-foreground truncate">
                          {getDescriptionDisplay(tx.description)}
                        </td>
                        <td className={`px-3 py-3 text-sm font-medium text-right ${amount >= 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {amount >= 0 ? '+' : ''}{amount.toLocaleString()}
                        </td>
                        <td className="px-3 py-3 text-sm text-muted-foreground text-right whitespace-nowrap">
                          {formatDate(tx.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() => handlePageChange(currentPage - 1)}
                        className={currentPage <= 1 || loadingTransactions ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        label={t.actions.previous}
                      />
                    </PaginationItem>
                    
                    {Array.from({ length: totalPages }).map((_, index) => {
                      const page = index + 1;
                      if (
                        page === 1 ||
                        page === totalPages ||
                        (page >= currentPage - 1 && page <= currentPage + 1)
                      ) {
                        return (
                          <PaginationItem key={page}>
                            <PaginationLink
                              isActive={page === currentPage}
                              onClick={() => handlePageChange(page)}
                              className={loadingTransactions ? "pointer-events-none opacity-50" : "cursor-pointer"}
                            >
                              {page}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      }
                      if (page === currentPage - 2 || page === currentPage + 2) {
                        return (
                          <PaginationItem key={page}>
                            <span className="flex h-9 w-9 items-center justify-center">...</span>
                          </PaginationItem>
                        );
                      }
                      return null;
                    })}

                    <PaginationItem>
                      <PaginationNext
                        onClick={() => handlePageChange(currentPage + 1)}
                        className={currentPage >= totalPages || loadingTransactions ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        label={t.actions.next}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </div>
        )}

        {/* Buy More Credits Button */}
        <Button asChild className="w-full">
          <Link href={`/${currentLocale}/pricing`}>
            <Coins className="h-4 w-4 mr-2" />
            {t.dashboard.credits.buyMore}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
