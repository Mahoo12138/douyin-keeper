"use client"

import { Input } from "@libs/react-shared/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@libs/react-shared/ui/select"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useState } from "react"
import { Button } from "@libs/react-shared/ui/button"
import { Search as SearchIcon, X } from "lucide-react"
import { useTranslation } from "@/hooks/use-translation"

type SearchField = "userEmail" | "userName" | "paymentAccount"
type WithdrawalStatus = "pending" | "processing" | "completed" | "rejected" | "all"

export function Search() {
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [searchValue, setSearchValue] = useState(searchParams?.get("searchValue") || "")
  const [searchField, setSearchField] = useState<SearchField>((searchParams?.get("searchField") as SearchField) || "userEmail")
  const [status, setStatus] = useState<WithdrawalStatus>((searchParams?.get("status") as WithdrawalStatus) || "all")

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
        page: "1",
      })}`
    )
  }

  const onFieldChange = (value: SearchField) => {
    setSearchField(value)
    setSearchValue("")
  }

  const onStatusChange = (value: WithdrawalStatus) => {
    setStatus(value)
    router.push(
      `${pathname}?${createQueryString({
        status: value === "all" ? null : value,
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
    router.push(
      `${pathname}?${createQueryString({
        searchValue: null,
        searchField: null,
        status: null,
        page: "1",
      })}`
    )
  }

  const getSearchPlaceholder = () => {
    const fieldMap: Record<SearchField, string> = {
      userEmail: t.admin.withdrawals.table.columns.userEmail,
      userName: t.admin.withdrawals.table.columns.userName,
      paymentAccount: t.admin.withdrawals.table.columns.paymentAccount,
    }
    return t.admin.withdrawals.table.search.searchPlaceholder.replace("{field}", fieldMap[searchField])
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 flex-1">
      <Select value={searchField} onValueChange={onFieldChange}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder={t.admin.withdrawals.table.search.searchBy} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="userEmail">{t.admin.withdrawals.table.columns.userEmail}</SelectItem>
          <SelectItem value="userName">{t.admin.withdrawals.table.columns.userName}</SelectItem>
          <SelectItem value="paymentAccount">{t.admin.withdrawals.table.columns.paymentAccount}</SelectItem>
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

      <div className="mx-2 h-4 w-px bg-border" />

      <Select value={status} onValueChange={onStatusChange}>
        <SelectTrigger className="w-[130px]">
          <SelectValue placeholder={t.admin.withdrawals.filter.filterByStatus} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t.admin.withdrawals.filter.allStatus}</SelectItem>
          <SelectItem value="pending">{t.admin.withdrawals.filter.pending}</SelectItem>
          <SelectItem value="processing">{t.admin.withdrawals.filter.processing}</SelectItem>
          <SelectItem value="completed">{t.admin.withdrawals.filter.completed}</SelectItem>
          <SelectItem value="rejected">{t.admin.withdrawals.filter.rejected}</SelectItem>
        </SelectContent>
      </Select>
    </form>
  )
}
