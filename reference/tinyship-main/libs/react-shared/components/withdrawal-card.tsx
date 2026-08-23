"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  Wallet,
  ArrowLeft,
  ArrowRight,
  History,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { createWithdrawalValidators } from "@libs/validators";
import { createNextTranslationFunction } from "@libs/validators";

interface Withdrawal {
  id: string;
  amount: string;
  currency: string;
  paymentMethod: string;
  paymentAccount: string;
  status: string;
  adminNote: string | null;
  createdAt: string;
}

type ViewState = "form" | "history";

interface WithdrawalCardProps {
  t: any;
}

export function WithdrawalCard({ t }: WithdrawalCardProps) {
  const [balance, setBalance] = useState(0);
  const [minAmount, setMinAmount] = useState(100);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [view, setView] = useState<ViewState>("form");

  const tWithParams = useMemo(() => createNextTranslationFunction(t), [t]);
  const { withdrawalFormSchema } = useMemo(
    () => createWithdrawalValidators(tWithParams),
    [tWithParams],
  );

  type FormData = z.infer<typeof withdrawalFormSchema>;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(withdrawalFormSchema),
    mode: "onBlur",
    defaultValues: {
      amount: "",
      paymentMethod: undefined,
      paymentAccount: "",
    },
  });

  const paymentMethodValue = watch("paymentMethod");

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, historyRes] = await Promise.all([
        fetch("/api/affiliate/stats").then((r) => r.json()),
        fetch("/api/withdrawal/history?limit=10").then((r) => r.json()),
      ]);
      setBalance(statsRes.commissionBalance || 0);
      setMinAmount(statsRes.minWithdrawalAmount || 100);
      setWithdrawals(historyRes.withdrawals || []);
    } catch (err) {
      console.error("Failed to load withdrawal data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onSubmit = async (formData: FormData) => {
    const amount = parseFloat(formData.amount);
    if (amount < minAmount) {
      toast.error(
        t.dashboard.withdrawal.minAmount?.replace("{amount}", String(minAmount)) ||
          `Minimum withdrawal amount: ${minAmount}`,
      );
      return;
    }
    if (amount > balance) {
      toast.error(t.dashboard.withdrawal.insufficientBalance || "Insufficient balance");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/withdrawal/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          amount,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to submit withdrawal");
        return;
      }
      toast.success(t.dashboard.withdrawal.submitSuccess || "Withdrawal request submitted");
      reset();
      fetchData();
    } catch {
      toast.error("Failed to submit withdrawal");
    } finally {
      setSubmitting(false);
    }
  };

  const statusBadge = (status: string) => {
    const statusMap: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      completed: "default",
      pending: "secondary",
      processing: "outline",
      rejected: "destructive",
    };
    const label =
      t.dashboard.withdrawal.status[status as keyof typeof t.dashboard.withdrawal.status] ||
      status;
    return <Badge variant={statusMap[status] || "secondary"}>{label}</Badge>;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            {t.dashboard.withdrawal?.title || "Withdrawal"}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (view === "history") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <button
              onClick={() => setView("form")}
              className="inline-flex items-center justify-center rounded-md p-1 hover:bg-muted transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            {t.dashboard.withdrawal.history}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {withdrawals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <History className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">{t.dashboard.withdrawal.noHistory}</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">
                      {t.dashboard.withdrawal.table.amount}
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">
                      {t.dashboard.withdrawal.table.method}
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">
                      {t.dashboard.withdrawal.table.account}
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">
                      {t.dashboard.withdrawal.table.status}
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">
                      {t.dashboard.withdrawal.table.date}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {withdrawals.map((w) => (
                    <tr key={w.id} className="hover:bg-muted/50">
                      <td className="px-4 py-3 text-sm font-medium">
                        {w.currency} {parseFloat(w.amount).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {t.dashboard.withdrawal.methods[
                          w.paymentMethod as keyof typeof t.dashboard.withdrawal.methods
                        ] || w.paymentMethod}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {w.paymentAccount}
                      </td>
                      <td className="px-4 py-3">{statusBadge(w.status)}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {new Date(w.createdAt).toLocaleDateString()}
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
          <Wallet className="h-5 w-5 text-primary" />
          {t.dashboard.withdrawal?.title || "Withdrawal"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Balance */}
        <div className="p-4 bg-muted/50 rounded-lg text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Wallet className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-muted-foreground">
              {t.dashboard.withdrawal.balance}
            </span>
          </div>
          <p className="text-2xl font-bold text-foreground">{balance.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {t.dashboard.withdrawal.minAmount?.replace("{amount}", String(minAmount)) ||
              `Min. withdrawal: ${minAmount}`}
          </p>
        </div>

        {/* Withdrawal form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] items-start gap-x-4 gap-y-1.5">
            <Label className="sm:text-right sm:min-w-20 sm:pt-2.5">{t.dashboard.withdrawal.amount}</Label>
            <div>
              <Input
                type="number"
                step="0.01"
                min={minAmount}
                placeholder={t.dashboard.withdrawal.amountPlaceholder}
                {...register("amount")}
                className={errors.amount ? "border-destructive" : ""}
                aria-invalid={errors.amount ? "true" : "false"}
              />
              {errors.amount && (
                <span className="text-destructive text-xs mt-1 block">
                  {errors.amount.message}
                </span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] items-start gap-x-4 gap-y-1.5">
            <Label className="sm:text-right sm:min-w-20 sm:pt-2.5">{t.dashboard.withdrawal.paymentMethod}</Label>
            <div>
              <Select
                value={paymentMethodValue}
                onValueChange={(v) =>
                  setValue("paymentMethod", v as "alipay" | "paypal" | "bank_transfer", {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger
                  className={errors.paymentMethod ? "border-destructive" : ""}
                  aria-invalid={errors.paymentMethod ? "true" : "false"}
                >
                  <SelectValue placeholder={t.dashboard.withdrawal.selectMethod} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alipay">
                    {t.dashboard.withdrawal.methods.alipay}
                  </SelectItem>
                  <SelectItem value="paypal">
                    {t.dashboard.withdrawal.methods.paypal}
                  </SelectItem>
                  <SelectItem value="bank_transfer">
                    {t.dashboard.withdrawal.methods.bank_transfer}
                  </SelectItem>
                </SelectContent>
              </Select>
              {errors.paymentMethod && (
                <span className="text-destructive text-xs mt-1 block">
                  {errors.paymentMethod.message}
                </span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] items-start gap-x-4 gap-y-1.5">
            <Label className="sm:text-right sm:min-w-20 sm:pt-2.5">{t.dashboard.withdrawal.paymentAccount}</Label>
            <div>
              <Input
                placeholder={t.dashboard.withdrawal.accountPlaceholder}
                {...register("paymentAccount")}
                className={errors.paymentAccount ? "border-destructive" : ""}
                aria-invalid={errors.paymentAccount ? "true" : "false"}
              />
              {errors.paymentAccount && (
                <span className="text-destructive text-xs mt-1 block">
                  {errors.paymentAccount.message}
                </span>
              )}
            </div>
          </div>
          <div className="sm:pl-24">
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t.dashboard.withdrawal.submit
              )}
            </Button>
          </div>
        </form>

        {/* View history link */}
        <button
          onClick={() => setView("history")}
          className="flex items-center justify-between w-full p-4 rounded-lg border hover:bg-muted/50 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <History className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm font-medium">{t.dashboard.withdrawal.history}</p>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </button>
      </CardContent>
    </Card>
  );
}
