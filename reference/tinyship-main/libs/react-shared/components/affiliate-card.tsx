"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import {
  Copy,
  Check,
  Users,
  Wallet,
  TrendingUp,
  Percent,
  Gift,
  ArrowLeft,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

interface AffiliateStats {
  referralCode: string;
  referralLink: string;
  commissionBalance: number;
  commissionRate: number;
  totalCommission: number;
  totalPaidReferrals: number;
  totalRegisteredReferrals: number;
  currency: string;
  referrerSignupBonus: number;
  refereeSignupBonus: number;
  minWithdrawalAmount: number;
  enabled: boolean;
}

interface Commission {
  id: string;
  orderId: string;
  orderAmount: string;
  commissionRate: string;
  commissionAmount: string;
  currency: string;
  status: string;
  createdAt: string;
  buyer?: { name: string | null; email: string } | null;
}

interface Referral {
  id: string;
  name: string | null;
  email: string;
  createdAt: string;
}

type ViewState = "overview" | "referrals" | "commissions";

interface AffiliateCardProps {
  t: any;
}

export function AffiliateCard({ t }: AffiliateCardProps) {
  const [stats, setStats] = useState<AffiliateStats | null>(null);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<ViewState>("overview");

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, commissionsRes, referralsRes] = await Promise.all([
        fetch("/api/affiliate/stats").then((r) => r.json()),
        fetch("/api/affiliate/commissions?limit=10").then((r) => r.json()),
        fetch("/api/affiliate/referrals?limit=10").then((r) => r.json()),
      ]);
      setStats(statsRes);
      setCommissions(commissionsRes.commissions || []);
      setReferrals(referralsRes.referrals || []);
    } catch (err) {
      console.error("Failed to load affiliate data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCopy = async () => {
    if (!stats?.referralLink) return;
    try {
      await navigator.clipboard.writeText(stats.referralLink);
      setCopied(true);
      toast.success(t.dashboard.affiliate.copied);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            {t.dashboard.affiliate?.title || "Affiliate"}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!stats?.enabled) {
    return null;
  }

  const statusBadge = (status: string) => {
    const statusMap: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      credited: "default",
      pending: "secondary",
      withdrawn: "outline",
      cancelled: "destructive",
    };
    const label =
      t.dashboard.affiliate.status[status as keyof typeof t.dashboard.affiliate.status] || status;
    return <Badge variant={statusMap[status] || "secondary"}>{label}</Badge>;
  };

  if (view === "referrals") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <button
              onClick={() => setView("overview")}
              className="inline-flex items-center justify-center rounded-md p-1 hover:bg-muted transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            {t.dashboard.affiliate.referralsTab}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {referrals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">{t.dashboard.affiliate.noReferrals}</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">
                      {t.dashboard.affiliate.table.user}
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">
                      {t.dashboard.affiliate.table.email}
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">
                      {t.dashboard.affiliate.table.joinDate}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {referrals.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/50">
                      <td className="px-4 py-3 text-sm">{r.name || "-"}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{r.email}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (view === "commissions") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <button
              onClick={() => setView("overview")}
              className="inline-flex items-center justify-center rounded-md p-1 hover:bg-muted transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            {t.dashboard.affiliate.commissionsTab}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {commissions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Wallet className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">{t.dashboard.affiliate.noCommissions}</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">
                      {t.dashboard.affiliate.table.buyer}
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">
                      {t.dashboard.affiliate.table.orderAmount}
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">
                      {t.dashboard.affiliate.table.commission}
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">
                      {t.dashboard.affiliate.table.status}
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">
                      {t.dashboard.affiliate.table.date}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {commissions.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/50">
                      <td className="px-4 py-3">
                        {c.buyer ? (
                          <div className="text-xs">
                            <div className="font-medium truncate max-w-[120px]">{c.buyer.name || "—"}</div>
                            <div className="text-muted-foreground truncate max-w-[120px]">{c.buyer.email}</div>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {c.currency} {parseFloat(c.orderAmount).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium">
                        {c.currency} {parseFloat(c.commissionAmount).toFixed(2)}
                        <span className="text-muted-foreground ml-1 text-xs">
                          ({(parseFloat(c.commissionRate) * 100).toFixed(0)}%)
                        </span>
                      </td>
                      <td className="px-4 py-3">{statusBadge(c.status)}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          {t.dashboard.affiliate?.title || "Affiliate"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Stats overview */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-muted/50 rounded-lg text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Wallet className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-muted-foreground">
                {t.dashboard.affiliate.commissionBalance}
              </span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              <span className="text-sm font-normal text-muted-foreground mr-1">{stats.currency}</span>
              {stats.commissionBalance?.toFixed(2) ?? "0.00"}
            </p>
          </div>
          <div className="p-4 bg-muted/50 rounded-lg text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">
                {t.dashboard.affiliate.totalCommission}
              </span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              <span className="text-sm font-normal text-muted-foreground mr-1">{stats.currency}</span>
              {stats.totalCommission?.toFixed(2) ?? "0.00"}
            </p>
          </div>
          <div className="p-4 bg-muted/50 rounded-lg text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">
                {t.dashboard.affiliate.totalReferrals}
              </span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {stats.totalRegisteredReferrals ?? 0}
            </p>
          </div>
          <div className="p-4 bg-muted/50 rounded-lg text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Percent className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">
                {t.dashboard.affiliate.commissionRate}
              </span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {((stats.commissionRate ?? 0) * 100).toFixed(0)}%
            </p>
          </div>
        </div>

        {/* Referral link */}
        <div className="p-4 bg-muted/50 rounded-lg space-y-3">
          <span className="text-sm font-medium text-muted-foreground">
            {t.dashboard.affiliate.referralLink}
          </span>
          <div className="flex gap-2">
            <Input
              value={stats.referralLink ?? ""}
              readOnly
              className="font-mono text-sm bg-background"
            />
            <Button variant="outline" size="icon" onClick={handleCopy} className="shrink-0">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          {(stats.referrerSignupBonus ?? 0) > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Gift className="h-4 w-4" />
              <span>
                {t.dashboard.affiliate.referrerBonus?.replace(
                  "{amount}",
                  String(stats.referrerSignupBonus)
                )}
              </span>
            </div>
          )}
        </div>

        {/* Quick links to sub-views */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => setView("referrals")}
            className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm font-medium">{t.dashboard.affiliate.referralsTab}</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </button>
          <button
            onClick={() => setView("commissions")}
            className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <Wallet className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm font-medium">{t.dashboard.affiliate.commissionsTab}</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
