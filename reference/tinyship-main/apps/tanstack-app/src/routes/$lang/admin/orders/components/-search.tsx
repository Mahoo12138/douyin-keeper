import { Input } from "@libs/react-shared/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@libs/react-shared/ui/select"
import { useState, useCallback } from "react"
import { Button } from "@libs/react-shared/ui/button"
import { Search as SearchIcon, X } from "lucide-react"
import { useTranslation } from "@/hooks/use-translation"

type SearchField = "id" | "userId" | "planId" | "userEmail" | "providerOrderId"
type OrderStatus = "pending" | "paid" | "failed" | "refunded" | "canceled" | "all"
type PaymentProvider = "stripe" | "wechat" | "creem" | "all"

export function Search() {
  const { t } = useTranslation()
  const urlParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
  const [searchValue, setSearchValue] = useState(urlParams.get("searchValue") || "")
  const [searchField, setSearchField] = useState<SearchField>((urlParams.get("searchField") as SearchField) || "userEmail")
  const [status, setStatus] = useState<OrderStatus>((urlParams.get("status") as OrderStatus) || "all")
  const [provider, setProvider] = useState<PaymentProvider>((urlParams.get("provider") as PaymentProvider) || "all")

  const createQueryString = useCallback(
    (params: Record<string, string | null>) => {
      const newParams = new URLSearchParams(window.location.search)
      Object.entries(params).forEach(([key, value]) => {
        if (value === null) {
          newParams.delete(key)
        } else {
          newParams.set(key, value)
        }
      })
      return newParams.toString()
    },
    []
  )

  const onSearch = () => {
    window.location.href = `${window.location.pathname}?${createQueryString({
      searchValue: searchValue || null,
      searchField,
      status: status === "all" ? null : status,
      provider: provider === "all" ? null : provider,
      page: "1",
    })}`
  }

  const onFieldChange = (value: SearchField) => {
    setSearchField(value)
    setSearchValue("")
  }

  const onStatusChange = (value: OrderStatus) => {
    setStatus(value)
    window.location.href = `${window.location.pathname}?${createQueryString({
      status: value === "all" ? null : value,
      page: "1",
    })}`
  }

  const onProviderChange = (value: PaymentProvider) => {
    setProvider(value)
    window.location.href = `${window.location.pathname}?${createQueryString({
      provider: value === "all" ? null : value,
      page: "1",
    })}`
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSearch()
  }

  const handleClear = () => {
    setSearchValue("")
    setSearchField("userEmail")
    setStatus("all")
    setProvider("all")
    window.location.href = `${window.location.pathname}?${createQueryString({
      searchValue: null,
      searchField: null,
      status: null,
      provider: null,
      page: "1",
    })}`
  }

  const getSearchPlaceholder = () => {
    const fieldMap: Record<SearchField, string> = {
      id: t.admin.orders.table.columns.id,
      userId: "User ID",
      planId: t.admin.orders.table.columns.plan,
      userEmail: "Email",
      providerOrderId: t.admin.orders.table.columns.providerOrderId,
    }
    return t.admin.orders.table.search.searchPlaceholder.replace("{field}", fieldMap[searchField])
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 flex-1">
      <Select value={searchField} onValueChange={onFieldChange}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder={t.admin.orders.table.search.searchBy} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="userEmail">Email</SelectItem>
          <SelectItem value="planId">{t.admin.orders.table.columns.plan}</SelectItem>
          <SelectItem value="id">{t.admin.orders.table.columns.id}</SelectItem>
          <SelectItem value="userId">User ID</SelectItem>
          <SelectItem value="providerOrderId">{t.admin.orders.table.columns.providerOrderId}</SelectItem>
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

      <Select value={status} onValueChange={onStatusChange}>
        <SelectTrigger className="w-[130px]">
          <SelectValue placeholder={t.admin.orders.table.search.filterByStatus} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t.admin.orders.table.search.allStatus}</SelectItem>
          <SelectItem value="pending">{t.admin.orders.status.pending}</SelectItem>
          <SelectItem value="paid">{t.admin.orders.status.paid}</SelectItem>
          <SelectItem value="failed">{t.admin.orders.status.failed}</SelectItem>
          <SelectItem value="refunded">{t.admin.orders.status.refunded}</SelectItem>
          <SelectItem value="canceled">{t.admin.orders.status.canceled}</SelectItem>
        </SelectContent>
      </Select>

      <Select value={provider} onValueChange={onProviderChange}>
        <SelectTrigger className="w-[130px]">
          <SelectValue placeholder={t.admin.orders.table.search.filterByProvider} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t.admin.orders.table.search.allProviders}</SelectItem>
          <SelectItem value="stripe">{t.admin.orders.table.search.stripe}</SelectItem>
          <SelectItem value="wechat">{t.admin.orders.table.search.wechat}</SelectItem>
          <SelectItem value="creem">{t.admin.orders.table.search.creem}</SelectItem>
        </SelectContent>
      </Select>
    </form>
  )
}
