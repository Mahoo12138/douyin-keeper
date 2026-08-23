import { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@libs/react-shared/ui/badge"
import { Button } from "@libs/react-shared/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@libs/react-shared/ui/dropdown-menu"
import { ArrowUpDown, ArrowUp, ArrowDown, Pencil, Trash2 } from "lucide-react"
import { useTranslation } from "@/hooks/use-translation"
import { toast } from "sonner"

export type BlogPost = {
  id: string
  title: string
  slug: string
  status: string
  authorName: string | null
  publishedAt: string | Date | null
  createdAt: string | Date
}

const getStatusBadge = (status: string, t: any) => {
  const statusConfig = {
    draft: { label: t.admin.blog.table.search.draft, variant: "secondary" as const },
    published: { label: t.admin.blog.table.search.published, variant: "default" as const },
  }
  const config = statusConfig[status as keyof typeof statusConfig] || { label: status, variant: "outline" as const }
  return <Badge variant={config.variant}>{config.label}</Badge>
}

const formatDate = (date: string | Date | null) => {
  if (!date) return "N/A"
  const d = typeof date === "string" ? new Date(date) : date
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const SortableHeader = ({
  column,
  title,
  t,
}: {
  column: any
  title: string
  t: any
}) => {
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
          {t.admin.blog.table.sort.ascending}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
          <ArrowDown className="mr-2 h-4 w-4" />
          {t.admin.blog.table.sort.descending}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => column.clearSorting()}>
          <ArrowUpDown className="mr-2 h-4 w-4" />
          {t.admin.blog.table.sort.none}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function useBlogColumns(): ColumnDef<BlogPost>[] {
  const { t } = useTranslation()

  return [
    {
      accessorKey: "title",
      header: ({ column }) => (
        <SortableHeader column={column} title={t.admin.blog.table.columns.title} t={t} />
      ),
      cell: ({ row }) => {
        const title = row.getValue("title") as string
        return (
          <div className="font-medium max-w-[200px] truncate" title={title}>
            {title || t.common.notAvailable}
          </div>
        )
      },
      enableHiding: false,
    },
    {
      accessorKey: "slug",
      header: "Slug",
      cell: ({ row }) => {
        const slug = row.getValue("slug") as string
        return (
          <div className="text-sm text-muted-foreground max-w-[150px] truncate" title={slug}>
            {slug}
          </div>
        )
      },
      enableSorting: false,
    },
    {
      accessorKey: "status",
      header: t.admin.blog.table.columns.status,
      cell: ({ row }) => getStatusBadge(row.getValue("status"), t),
      enableHiding: false,
      enableSorting: false,
    },
    {
      accessorKey: "authorName",
      header: t.admin.blog.table.columns.author,
      cell: ({ row }) => {
        const name = row.getValue("authorName") as string | null
        return (
          <div className="text-sm text-muted-foreground">
            {name || t.common.notAvailable}
          </div>
        )
      },
      enableSorting: false,
    },
    {
      accessorKey: "publishedAt",
      header: ({ column }) => (
        <SortableHeader column={column} title={t.admin.blog.table.columns.publishedAt} t={t} />
      ),
      cell: ({ row }) => {
        const date = row.getValue("publishedAt") as string | Date | null
        return <div className="text-sm text-muted-foreground">{formatDate(date)}</div>
      },
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <SortableHeader column={column} title={t.admin.blog.table.columns.createdAt} t={t} />
      ),
      cell: ({ row }) => {
        const date = row.getValue("createdAt") as string | Date | null
        return <div className="text-sm text-muted-foreground">{formatDate(date)}</div>
      },
    },
    {
      id: "actions",
      header: () => <div className="text-right">{t.admin.blog.table.columns.actions}</div>,
      cell: ({ row }) => {
        const post = row.original
        const lang = typeof window !== "undefined" ? window.location.pathname.split("/")[1] : "en"

        return (
          <div className="flex items-center justify-end gap-2">
            <a href={`/${lang}/admin/blog/${post.id}`}>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Pencil className="h-4 w-4" />
                <span className="sr-only">{t.admin.blog.table.actions.edit}</span>
              </Button>
            </a>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={async () => {
                if (confirm(t.admin.blog.deleteDialog.description)) {
                  const res = await fetch(`/api/admin/blog/${post.id}`, { method: "DELETE" })
                  if (res.ok) {
                    toast.success(t.admin.blog.messages.deleteSuccess)
                    window.location.reload()
                  } else {
                    toast.error(t.admin.blog.messages.deleteError)
                  }
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">{t.admin.blog.table.actions.delete}</span>
            </Button>
          </div>
        )
      },
      enableHiding: false,
      enableSorting: false,
    },
  ]
}
