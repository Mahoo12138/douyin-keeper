import { createFileRoute } from '@tanstack/react-router'
import { seoHead } from '@/lib/seo'
import { useTranslation } from '@/hooks/use-translation'
import { useEffect, useState } from 'react'
import { authClientReact } from '@libs/auth/authClient'
import { toast } from 'sonner'
import { DashboardTabs } from '@/components/dashboard/dashboard-tabs'
import { Loader2 } from 'lucide-react'
import { requireAuth } from '@/lib/auth-guard'
import { useReferralClaim } from '@libs/react-shared/hooks/use-referral-claim'

export const Route = createFileRoute('/$lang/(root)/dashboard')({
  beforeLoad: async ({ params }) => {
    await requireAuth({ params: params as { lang: string } })
  },
  head: ({ params }) => seoHead(params.lang, (t) => t.dashboard.metadata),
  component: DashboardPage,
})

function DashboardPage() {
  const { t, locale: currentLocale } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', image: '' })
  const [updateLoading, setUpdateLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const { data: session, isPending } = authClientReact.useSession()
  const user = session?.user

  useReferralClaim({
    bonusFailed: t.dashboard.affiliate.bonusFailed,
    claimFailed: t.dashboard.affiliate.claimFailed,
  })

  useEffect(() => {
    if (user) {
      setEditForm({ name: user.name || '', image: user.image || '' })
      setLoading(false)
    } else if (!isPending) {
      setLoading(false)
      window.location.href = `/${currentLocale}/signin`
    }
  }, [user, refreshKey, isPending, currentLocale])

  const formatDate = (dateString: string | Date) => {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString
    return date.toLocaleDateString(currentLocale === 'zh-CN' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case 'admin': return t.dashboard.roles.admin
      case 'user': return t.dashboard.roles.user
      default: return role
    }
  }

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin': return 'destructive'
      case 'user': return 'secondary'
      default: return 'outline'
    }
  }

  const handleUpdateProfile = async () => {
    if (!user) return
    setUpdateLoading(true)

    const { data, error } = await authClientReact.updateUser({
      name: editForm.name.trim() || undefined,
      image: editForm.image.trim() || undefined,
    })

    if (error) {
      console.error('Failed to update profile:', error)
      toast.error(error.message || t.dashboard.profile.updateError)
      setUpdateLoading(false)
      return
    }

    setIsEditing(false)
    toast.success(t.dashboard.profile.updateSuccess)
    setRefreshKey((prev) => prev + 1)

    setTimeout(async () => {
      try { await authClientReact.getSession() }
      catch (error) { console.error('Failed to refresh session:', error) }
    }, 100)

    setUpdateLoading(false)
  }

  const handleCancelEdit = () => {
    setEditForm({ name: user?.name || '', image: user?.image || '' })
    setIsEditing(false)
  }

  if (isPending || loading) {
    return (
      <div className="container py-8">
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="text-primary h-10 w-10 animate-spin" />
        </div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="container py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">{t.dashboard.title}</h1>
          <p className="text-muted-foreground mt-2">{t.dashboard.description}</p>
        </div>
        <DashboardTabs
          user={user}
          isEditing={isEditing}
          setIsEditing={setIsEditing}
          editForm={editForm}
          setEditForm={setEditForm}
          updateLoading={updateLoading}
          handleUpdateProfile={handleUpdateProfile}
          handleCancelEdit={handleCancelEdit}
          formatDate={formatDate}
          getRoleDisplayName={getRoleDisplayName}
          getRoleBadgeVariant={getRoleBadgeVariant}
        />
      </div>
    </div>
  )
}
