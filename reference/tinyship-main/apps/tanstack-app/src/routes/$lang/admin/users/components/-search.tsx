import { Input } from "@libs/react-shared/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@libs/react-shared/ui/select"
import { useCallback, useState } from "react"
import { Button } from "@libs/react-shared/ui/button"
import { Search as SearchIcon, X } from "lucide-react"
import { useTranslation } from "@/hooks/use-translation"

type SearchField = "email" | "name" | "id"
type Role = "admin" | "user" | "all"
type BannedStatus = "true" | "false" | "all"

export function Search() {
  const { t } = useTranslation()
  const currentParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
  const [searchValue, setSearchValue] = useState(currentParams.get("searchValue") || "")
  const [searchField, setSearchField] = useState<SearchField>((currentParams.get("searchField") as SearchField) || "email")
  const [role, setRole] = useState<Role>((currentParams.get("role") as Role) || "all")
  const [banned, setBanned] = useState<BannedStatus>((currentParams.get("banned") as BannedStatus) || "all")

  const createQueryString = useCallback(
    (params: Record<string, string | null>) => {
      const newSearchParams = new URLSearchParams(window.location.search)

      Object.entries(params).forEach(([key, value]) => {
        if (value === null) {
          newSearchParams.delete(key)
        } else {
          newSearchParams.set(key, value)
        }
      })

      return newSearchParams.toString()
    },
    []
  )

  const navigateWithParams = (params: Record<string, string | null>) => {
    const pathname = window.location.pathname
    window.location.href = `${pathname}?${createQueryString(params)}`
  }

  const onSearch = () => {
    navigateWithParams({
      searchValue: searchValue || null,
      searchField,
      role: role === "all" ? null : role,
      banned: banned === "all" ? null : banned,
      page: "1",
    })
  }

  const onFieldChange = (value: SearchField) => {
    setSearchField(value)
    setSearchValue("")
  }

  const onRoleChange = (value: Role) => {
    setRole(value)
    navigateWithParams({
      role: value === "all" ? null : value,
      page: "1",
    })
  }

  const onBannedChange = (value: BannedStatus) => {
    setBanned(value)
    navigateWithParams({
      banned: value === "all" ? null : value,
      page: "1",
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSearch()
  }

  const handleClear = () => {
    setSearchValue("")
    setSearchField("email")
    setRole("all")
    setBanned("all")
    navigateWithParams({
      searchValue: null,
      searchField: null,
      role: null,
      banned: null,
      page: "1",
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 flex-1">
      <Select value={searchField} onValueChange={onFieldChange}>
        <SelectTrigger className="w-[120px]">
          <SelectValue placeholder={t.admin.users.table.search.searchBy} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="email">{t.admin.users.table.columns.email}</SelectItem>
          <SelectItem value="name">{t.admin.users.table.columns.name}</SelectItem>
          <SelectItem value="id">{t.admin.users.table.columns.id}</SelectItem>
        </SelectContent>
      </Select>

      <Input
        placeholder={t.admin.users.table.search.searchPlaceholder.replace("{field}", searchField)}
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

      <Select value={role} onValueChange={onRoleChange}>
        <SelectTrigger className="w-[130px]">
          <SelectValue placeholder={t.admin.users.table.search.filterByRole} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t.admin.users.table.search.allRoles}</SelectItem>
          <SelectItem value="admin">Admin</SelectItem>
          <SelectItem value="user">User</SelectItem>
        </SelectContent>
      </Select>

      <Select value={banned} onValueChange={onBannedChange}>
        <SelectTrigger className="w-[130px]">
          <SelectValue placeholder={t.admin.users.table.search.banStatus} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t.admin.users.table.search.allUsers}</SelectItem>
          <SelectItem value="true">{t.admin.users.table.search.bannedUsers}</SelectItem>
          <SelectItem value="false">{t.admin.users.table.search.notBannedUsers}</SelectItem>
        </SelectContent>
      </Select>
    </form>
  )
}
