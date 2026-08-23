"use client"

import { Input } from "@libs/react-shared/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@libs/react-shared/ui/select"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useState } from "react"
import { Button } from "@libs/react-shared/ui/button"
import { Search as SearchIcon, X } from "lucide-react"
import { useTranslation } from "@/hooks/use-translation"

type SearchField = "id" | "userId" | "planId" | "stripeSubscriptionId" | "creemSubscriptionId" | "dodoSubscriptionId" | "userEmail";
type SubscriptionStatus = "active" | "canceled" | "expired" | "trialing" | "inactive" | "all";
type PaymentType = "one_time" | "recurring" | "all";
type PaymentProvider = "stripe" | "creem" | "dodo" | "wechat" | "all";

export function Search() {
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [searchValue, setSearchValue] = useState(searchParams?.get("searchValue") || "")
  const [searchField, setSearchField] = useState<SearchField>((searchParams?.get("searchField") as SearchField) || "userEmail")
  const [status, setStatus] = useState<SubscriptionStatus>((searchParams?.get("status") as SubscriptionStatus) || "all")
  const [paymentType, setPaymentType] = useState<PaymentType>((searchParams?.get("paymentType") as PaymentType) || "all")
  const [provider, setProvider] = useState<PaymentProvider>((searchParams?.get("provider") as PaymentProvider) || "all")

  const createQueryString = useCallback(
    (params: Record<string, string | null>) => {
      const newSearchParams = new URLSearchParams(searchParams?.toString())
      
      Object.entries(params).forEach(([key, value]) => {
        if (value === null) {
          newSearchParams.delete(key)
        } else {
          newSearchParams.set(key, value)
        }
      })
      
      return newSearchParams.toString()
    },
    [searchParams]
  )

  const onSearch = () => {
    router.push(
      `${pathname}?${createQueryString({
        searchValue: searchValue || null,
        searchField,
        status: status === "all" ? null : status,
        paymentType: paymentType === "all" ? null : paymentType,
        provider: provider === "all" ? null : provider,
        page: "1", // Reset to first page on search
      })}`
    )
  }

  const onFieldChange = (value: SearchField) => {
    setSearchField(value)
    setSearchValue("") // Clear search value when changing field
  }

  const onStatusChange = (value: SubscriptionStatus) => {
    setStatus(value)
    router.push(
      `${pathname}?${createQueryString({
        status: value === "all" ? null : value,
        page: "1",
      })}`
    )
  }

  const onPaymentTypeChange = (value: PaymentType) => {
    setPaymentType(value)
    router.push(
      `${pathname}?${createQueryString({
        paymentType: value === "all" ? null : value,
        page: "1",
      })}`
    )
  }

  const onProviderChange = (value: PaymentProvider) => {
    setProvider(value)
    router.push(
      `${pathname}?${createQueryString({
        provider: value === "all" ? null : value,
        page: "1",
      })}`
    )
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSearch()
  }

  const handleClear = () => {
    setSearchValue("")
    setSearchField("userEmail")
    setStatus("all")
    setPaymentType("all")
    setProvider("all")
    router.push(
      `${pathname}?${createQueryString({
        searchValue: null,
        searchField: null,
        status: null,
        paymentType: null,
        provider: null,
        page: "1",
      })}`
    )
  }

  const getSearchPlaceholder = () => {
    const fieldMap: Record<SearchField, string> = {
      id: t.admin.subscriptions.table.columns.id,
      userId: "User ID",
      planId: t.admin.subscriptions.table.columns.plan,
      userEmail: "Email",
      stripeSubscriptionId: t.admin.subscriptions.table.search.stripeSubscriptionId,
      creemSubscriptionId: t.admin.subscriptions.table.search.creemSubscriptionId,
      dodoSubscriptionId: t.admin.subscriptions.table.search.dodoSubscriptionId,
    }
    return t.admin.subscriptions.table.search.searchPlaceholder.replace("{field}", fieldMap[searchField])
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 flex-1">
      <Select
        value={searchField}
        onValueChange={onFieldChange}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder={t.admin.subscriptions.table.search.searchBy} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="userEmail">Email</SelectItem>
          <SelectItem value="planId">{t.admin.subscriptions.table.columns.plan}</SelectItem>
          <SelectItem value="id">{t.admin.subscriptions.table.columns.id}</SelectItem>
          <SelectItem value="userId">User ID</SelectItem>
          <SelectItem value="stripeSubscriptionId">{t.admin.subscriptions.table.search.stripeSubscriptionId}</SelectItem>
          <SelectItem value="creemSubscriptionId">{t.admin.subscriptions.table.search.creemSubscriptionId}</SelectItem>
          <SelectItem value="dodoSubscriptionId">{t.admin.subscriptions.table.search.dodoSubscriptionId}</SelectItem>
        </SelectContent>
      </Select>

      <Input
        placeholder={getSearchPlaceholder()}
        value={searchValue}
        onChange={(e) => setSearchValue(e.target.value)}
        className="w-[250px]"
      />
      
      <Button type="submit" size="icon" className="shrink-0">
        <SearchIcon className="h-4 w-4" />
      </Button>

      <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={handleClear}>
        <X className="h-4 w-4" />
      </Button>

      <div className="mx-2 h-4 w-[1px] bg-border" />

      <Select
        value={status}
        onValueChange={onStatusChange}
      >
        <SelectTrigger className="w-[130px]">
          <SelectValue placeholder={t.admin.subscriptions.table.search.filterByStatus} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t.admin.subscriptions.table.search.allStatus}</SelectItem>
          <SelectItem value="active">{t.admin.subscriptions.table.search.active}</SelectItem>
          <SelectItem value="canceled">{t.admin.subscriptions.table.search.canceled}</SelectItem>
          <SelectItem value="expired">{t.admin.subscriptions.table.search.expired}</SelectItem>
          <SelectItem value="trialing">{t.admin.subscriptions.table.search.trialing}</SelectItem>
          <SelectItem value="inactive">{t.admin.subscriptions.table.search.inactive}</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={paymentType}
        onValueChange={onPaymentTypeChange}
      >
        <SelectTrigger className="w-[130px]">
          <SelectValue placeholder={t.admin.subscriptions.table.search.filterByPaymentType} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t.admin.subscriptions.table.search.allPaymentTypes}</SelectItem>
          <SelectItem value="one_time">{t.admin.subscriptions.table.search.oneTime}</SelectItem>
          <SelectItem value="recurring">{t.admin.subscriptions.table.search.recurring}</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={provider}
        onValueChange={onProviderChange}
      >
        <SelectTrigger className="w-[130px]">
          <SelectValue placeholder={t.admin.subscriptions.table.search.filterByProvider} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t.admin.subscriptions.table.search.allProviders}</SelectItem>
          <SelectItem value="stripe">{t.admin.subscriptions.table.search.stripe}</SelectItem>
          <SelectItem value="creem">{t.admin.subscriptions.table.search.creem}</SelectItem>
          <SelectItem value="dodo">{t.admin.subscriptions.table.search.dodo}</SelectItem>
          <SelectItem value="wechat">{t.admin.subscriptions.table.search.wechat}</SelectItem>
        </SelectContent>
      </Select>
    </form>
  )
} 