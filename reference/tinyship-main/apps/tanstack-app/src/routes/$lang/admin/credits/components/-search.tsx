import { Input } from "@libs/react-shared/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@libs/react-shared/ui/select"
import { useState, useCallback } from "react"
import { Button } from "@libs/react-shared/ui/button"
import { Search as SearchIcon, X } from "lucide-react"
import { useTranslation } from "@/hooks/use-translation"

type SearchField = "id" | "userId" | "userEmail" | "userName"
type TransactionType = "purchase" | "consumption" | "refund" | "bonus" | "adjustment" | "all"

export function Search() {
  const { t } = useTranslation()
  const urlParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
  const [searchValue, setSearchValue] = useState(urlParams.get("searchValue") || "")
  const [searchField, setSearchField] = useState<SearchField>((urlParams.get("searchField") as SearchField) || "userEmail")
  const [type, setType] = useState<TransactionType>((urlParams.get("type") as TransactionType) || "all")

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
      type: type === "all" ? null : type,
      page: "1",
    })}`
  }

  const onFieldChange = (value: SearchField) => {
    setSearchField(value)
    setSearchValue("")
  }

  const onTypeChange = (value: TransactionType) => {
    setType(value)
    window.location.href = `${window.location.pathname}?${createQueryString({
      type: value === "all" ? null : value,
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
    setType("all")
    window.location.href = `${window.location.pathname}?${createQueryString({
      searchValue: null,
      searchField: null,
      type: null,
      page: "1",
    })}`
  }

  const getSearchPlaceholder = () => {
    const fieldMap: Record<SearchField, string> = {
      id: t.admin.credits.table.columns.id,
      userId: "User ID",
      userEmail: "Email",
      userName: "Name",
    }
    return t.admin.credits.table.search.searchPlaceholder.replace("{field}", fieldMap[searchField])
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 flex-1">
      <Select value={searchField} onValueChange={onFieldChange}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder={t.admin.credits.table.search.searchBy} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="userEmail">Email</SelectItem>
          <SelectItem value="userName">Name</SelectItem>
          <SelectItem value="id">{t.admin.credits.table.columns.id}</SelectItem>
          <SelectItem value="userId">User ID</SelectItem>
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

      <Select value={type} onValueChange={onTypeChange}>
        <SelectTrigger className="w-[130px]">
          <SelectValue placeholder={t.admin.credits.table.search.filterByType} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t.admin.credits.table.search.allTypes}</SelectItem>
          <SelectItem value="purchase">{t.admin.credits.table.search.purchase}</SelectItem>
          <SelectItem value="consumption">{t.admin.credits.table.search.consumption}</SelectItem>
          <SelectItem value="refund">{t.admin.credits.table.search.refund}</SelectItem>
          <SelectItem value="bonus">{t.admin.credits.table.search.bonus}</SelectItem>
          <SelectItem value="adjustment">{t.admin.credits.table.search.adjustment}</SelectItem>
        </SelectContent>
      </Select>
    </form>
  )
}
