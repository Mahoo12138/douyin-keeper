"use client"

import { Input } from "@libs/react-shared/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@libs/react-shared/ui/select"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useState } from "react"
import { Button } from "@libs/react-shared/ui/button"
import { Search as SearchIcon, X } from "lucide-react"
import { useTranslation } from "@/hooks/use-translation"

type SearchField = "referrerEmail" | "referrerName" | "orderId"
type CommissionStatus = "credited" | "pending" | "withdrawn" | "cancelled" | "all"

export function Search() {
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [searchValue, setSearchValue] = useState(searchParams?.get("searchValue") || "")
  const [searchField, setSearchField] = useState<SearchField>((searchParams?.get("searchField") as SearchField) || "referrerEmail")
  const [status, setStatus] = useState<CommissionStatus>((searchParams?.get("status") as CommissionStatus) || "all")

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

  const onStatusChange = (value: CommissionStatus) => {
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
    setSearchField("referrerEmail")
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
      referrerEmail: t.admin.commissions.table.columns.referrerEmail,
      referrerName: t.admin.commissions.table.columns.referrerName,
      orderId: t.admin.commissions.table.columns.orderId,
    }
    return t.admin.commissions.table.search.searchPlaceholder.replace("{field}", fieldMap[searchField])
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 flex-1">
      <Select value={searchField} onValueChange={onFieldChange}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder={t.admin.commissions.table.search.searchBy} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="referrerEmail">{t.admin.commissions.table.columns.referrerEmail}</SelectItem>
          <SelectItem value="referrerName">{t.admin.commissions.table.columns.referrerName}</SelectItem>
          <SelectItem value="orderId">{t.admin.commissions.table.columns.orderId}</SelectItem>
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
          <SelectValue placeholder={t.admin.commissions.filter.filterByStatus} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t.admin.commissions.filter.allStatus}</SelectItem>
          <SelectItem value="credited">{t.admin.commissions.filter.credited}</SelectItem>
          <SelectItem value="pending">{t.admin.commissions.filter.pending}</SelectItem>
          <SelectItem value="withdrawn">{t.admin.commissions.filter.withdrawn}</SelectItem>
          <SelectItem value="cancelled">{t.admin.commissions.filter.cancelled}</SelectItem>
        </SelectContent>
      </Select>
    </form>
  )
}
