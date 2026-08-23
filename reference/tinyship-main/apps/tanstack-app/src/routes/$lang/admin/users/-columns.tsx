import { type ColumnDef } from "@tanstack/react-table"
import type { User } from '@libs/database'
import { userRoles, type UserRole } from '@libs/database/constants'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@libs/react-shared/ui/select"
import { Switch } from "@libs/react-shared/ui/switch"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@libs/react-shared/ui/alert-dialog"
import { useState } from "react"
import { MoreHorizontal, ArrowUpDown, ArrowUp, ArrowDown, Copy } from "lucide-react"
import { Button } from "@libs/react-shared/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@libs/react-shared/ui/dropdown-menu"
import { authClientReact } from "@libs/auth/authClient"
import { useTranslation } from "@/hooks/use-translation"

const formatDate = (date: string | Date | null) => {
  if (!date) return 'N/A'
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const SortableHeader = ({ column, title, t }: { column: any; title: string; t: any }) => {
  const sortDirection = column.getIsSorted()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-auto p-0 font-medium hover:bg-transparent hover:text-accent-foreground flex items-center"
        >
          {title}
          <div className="ml-2 flex flex-col">
            {sortDirection === "asc" ? (
              <ArrowUp className="h-3 w-3" />
            ) : sortDirection === "desc" ? (
              <ArrowDown className="h-3 w-3" />
            ) : (
              <ArrowUpDown className="h-3 w-3" />
            )}
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => column.toggleSorting(false)}>
          <ArrowUp className="mr-2 h-4 w-4" />
          {t.admin.users.table.sort.ascending}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
          <ArrowDown className="mr-2 h-4 w-4" />
          {t.admin.users.table.sort.descending}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => column.clearSorting()}>
          <ArrowUpDown className="mr-2 h-4 w-4" />
          {t.admin.users.table.sort.none}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const BannedCellComponent = ({ value, userId }: { value: boolean; userId: string }) => {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [checked, setChecked] = useState(value)

  const handleConfirm = async () => {
    const { error } = await (!checked
      ? authClientReact.admin.banUser({
          userId,
          banReason: 'No reason provided',
        })
      : authClientReact.admin.unbanUser({
          userId,
        }))

    if (error) {
      toast.error(error.message || t.admin.users.messages.operationFailed)
      console.error('Error updating user status:', error)
      return
    }

    setChecked(!checked)
    setIsOpen(false)
    toast.success(checked ? t.admin.users.table.dialog.unbanSuccess : t.admin.users.table.dialog.banSuccess)
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        <div className="flex items-center">
          <Switch
            checked={checked}
            onClick={(e) => {
              e.preventDefault()
              if (!checked) {
                setIsOpen(true)
              } else {
                handleConfirm()
              }
            }}
          />
        </div>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.admin.users.table.dialog.banTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {t.admin.users.table.dialog.banDescription}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t.actions.cancel}</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>{t.actions.confirm}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

const RoleCellComponent = ({ currentRole, userId }: { currentRole: string; userId: string }) => {
  const { t } = useTranslation()
  const handleRoleChange = async (newRole: string) => {
    const { error } = await authClientReact.admin.setRole({
      userId,
      role: newRole as UserRole,
    })

    if (error) {
      toast.error(error.message || t.admin.users.table.dialog.updateRoleFailed)
      console.error('Error updating user role:', error)
      return
    }

    toast.success(t.admin.users.table.dialog.updateRoleSuccess)
  }

  return (
    <Select defaultValue={currentRole} onValueChange={handleRoleChange}>
      <SelectTrigger className="w-[100px]">
        <SelectValue placeholder={t.admin.users.form.placeholders.selectRole} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={userRoles.ADMIN}>{userRoles.ADMIN}</SelectItem>
        <SelectItem value={userRoles.USER}>{userRoles.USER}</SelectItem>
      </SelectContent>
    </Select>
  )
}

const ActionsCellComponent = ({ user }: { user: User }) => {
  const { t, locale } = useTranslation()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const handleDeleteConfirm = async () => {
    const { error } = await authClientReact.admin.removeUser({
      userId: user.id,
    })

    if (error) {
      toast.error(error.message || t.admin.users.messages.deleteError)
      console.error('Error deleting user:', error)
      return
    }

    setDeleteDialogOpen(false)
    toast.success(t.admin.users.messages.deleteSuccess)
    window.location.reload()
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">{t.admin.users.table.columns.actions}</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{t.admin.users.table.columns.actions}</DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => {
              window.location.href = `/${locale}/admin/users/${user.id}`
            }}
          >
            {t.admin.users.table.actions.editUser}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setDeleteDialogOpen(true)}
            className="text-red-600 focus:text-red-600"
          >
            {t.admin.users.table.actions.deleteUser}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.admin.users.deleteDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.admin.users.deleteDialog.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.actions.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {t.actions.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export const columns = (t: any) => {
  return [
    {
      accessorKey: "id",
      header: t.admin.users.table.columns.id,
      cell: ({ row }: any) => {
        const id = row.getValue("id") as string

        const copyToClipboard = async () => {
          try {
            await navigator.clipboard.writeText(id)
          } catch (err) {
            console.error('Failed to copy User ID:', err)
          }
        }

        return (
          <div className="group relative">
            <div
              className="font-mono text-sm max-w-[100px] truncate cursor-pointer"
              title={id}
              onClick={copyToClipboard}
            >
              #{id.slice(-8)}
            </div>
            <div className="absolute z-50 hidden group-hover:block top-full left-0 pt-1">
              <div className="bg-popover text-popover-foreground shadow-md rounded-md border p-2 text-xs font-mono min-w-max">
                <div className="flex items-center gap-2">
                  <span className="select-all">{id}</span>
                  <button
                    className="p-1 hover:bg-accent rounded"
                    onClick={copyToClipboard}
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {t.admin.users.table.actions.clickToCopy}
                </div>
              </div>
            </div>
          </div>
        )
      },
      enableSorting: false,
    },
    {
      accessorKey: "name",
      header: t.admin.users.table.columns.name,
      cell: ({ row }: any) => {
        const name = row.getValue("name") as string
        return (
          <div className="font-medium text-foreground" title={name || t.common.notAvailable}>
            {name || t.common.notAvailable}
          </div>
        )
      },
    },
    {
      accessorKey: "email",
      header: t.admin.users.table.columns.email,
      cell: ({ row }: any) => {
        const email = row.getValue("email") as string
        return (
          <div className="text-sm text-muted-foreground max-w-[200px] truncate" title={email || t.common.notAvailable}>
            {email || t.common.notAvailable}
          </div>
        )
      },
    },
    {
      accessorKey: "role",
      header: t.admin.users.table.columns.role,
      cell: ({ row }: any) => {
        const currentRole = row.getValue("role") as string
        const userId = row.getValue("id") as string
        return <RoleCellComponent currentRole={currentRole} userId={userId} />
      },
    },
    {
      accessorKey: "phoneNumber",
      header: t.admin.users.table.columns.phoneNumber,
      cell: ({ row }: any) => {
        const phoneNumber = row.getValue("phoneNumber") as string | null
        return (
          <div className="text-sm text-muted-foreground" title={phoneNumber || t.common.notAvailable}>
            {phoneNumber || t.common.notAvailable}
          </div>
        )
      },
    },
    {
      accessorKey: "emailVerified",
      header: t.admin.users.table.columns.emailVerified,
      cell: ({ row }: any) => {
        const isVerified = row.getValue("emailVerified") as boolean
        return (
          <div className="text-sm">
            {isVerified ? (
              <span className="text-green-600 font-medium">{t.common.yes}</span>
            ) : (
              <span className="text-muted-foreground">{t.common.no}</span>
            )}
          </div>
        )
      },
    },
    {
      accessorKey: "banned",
      header: t.admin.users.table.columns.banned,
      cell: ({ row }: any) => {
        const isBanned = row.getValue("banned") as boolean
        const userId = row.getValue("id") as string
        return <BannedCellComponent value={isBanned} userId={userId} />
      },
    },
    {
      accessorKey: "referralCode",
      header: t.admin.users.table.columns.referralCode,
      cell: ({ row }: any) => {
        const code = row.getValue("referralCode") as string | null
        return (
          <div className="font-mono text-xs text-muted-foreground">
            {code || "—"}
          </div>
        )
      },
      enableSorting: false,
    },
    {
      accessorKey: "referredByCode",
      header: t.admin.users.table.columns.referredByCode,
      cell: ({ row }: any) => {
        const referredBy = row.original.referredBy as { name: string | null; email: string } | null
        if (!referredBy) return <div className="text-muted-foreground">—</div>
        return (
          <div className="text-xs">
            <div className="font-medium">{referredBy.name || "—"}</div>
            <div className="text-muted-foreground">{referredBy.email}</div>
          </div>
        )
      },
      enableSorting: false,
    },
    {
      accessorKey: "commissionBalance",
      header: t.admin.users.table.columns.commissionBalance,
      cell: ({ row }: any) => {
        const balance = row.getValue("commissionBalance") as string | null
        const num = parseFloat(balance || "0")
        return (
          <div className={`text-sm font-medium ${num > 0 ? "text-foreground" : "text-muted-foreground"}`}>
            {num.toFixed(2)}
          </div>
        )
      },
      enableSorting: false,
    },
    {
      accessorKey: "createdAt",
      header: ({ column }: any) => {
        return <SortableHeader column={column} title={t.admin.users.table.columns.createdAt} t={t} />
      },
      cell: ({ row }: any) => {
        const date = row.getValue("createdAt") as string | Date | null
        return <div className="text-sm text-muted-foreground">{formatDate(date)}</div>
      },
      enableSorting: true,
    },
    {
      accessorKey: "updatedAt",
      header: ({ column }: any) => {
        return <SortableHeader column={column} title={t.admin.users.table.columns.updatedAt} t={t} />
      },
      cell: ({ row }: any) => {
        const date = row.getValue("updatedAt") as string | Date | null
        return <div className="text-sm text-muted-foreground">{formatDate(date)}</div>
      },
      enableSorting: true,
    },
    {
      id: "actions",
      cell: ({ row }: any) => {
        const user = row.original
        return <ActionsCellComponent user={user} />
      },
    },
  ] as ColumnDef<User>[]
}
