"use client"

import { Input } from "@libs/react-shared/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@libs/react-shared/ui/select"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useState } from "react"
import { Button } from "@libs/react-shared/ui/button"
import { Search as SearchIcon, X } from "lucide-react"
import { useTranslation } from "@/hooks/use-translation"

type BlogStatus = "draft" | "published" | "all"

export function Search() {
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [searchValue, setSearchValue] = useState(searchParams?.get("search") || "")
  const [status, setStatus] = useState<BlogStatus>(
    (searchParams?.get("status") as BlogStatus) || "all"
  )

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
        search: searchValue || null,
        status: status === "all" ? null : status,
        page: "1",
      })}`
    )
  }

  const onStatusChange = (value: BlogStatus) => {
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
    setStatus("all")
    router.push(
      `${pathname}?${createQueryString({
        search: null,
        status: null,
        page: "1",
      })}`
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 flex-1">
      <Input
        placeholder={t.admin.blog.table.search.searchPlaceholder}
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
          <SelectValue placeholder={t.admin.blog.table.search.filterByStatus} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t.admin.blog.table.search.allStatus}</SelectItem>
          <SelectItem value="draft">{t.admin.blog.table.search.draft}</SelectItem>
          <SelectItem value="published">{t.admin.blog.table.search.published}</SelectItem>
        </SelectContent>
      </Select>
    </form>
  )
}
