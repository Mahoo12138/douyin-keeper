import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from '@/hooks/use-translation'
import { Badge } from '@libs/react-shared/ui/badge'
import { Button } from '@libs/react-shared/ui/button'
import { Switch } from '@libs/react-shared/ui/switch'
import { Plus, Pencil, Trash2, Upload, AlertTriangle } from 'lucide-react'

export const Route = createFileRoute('/$lang/admin/pricing/')({
  component: AdminPricingPage,
})

interface PricingPlan {
  id: string
  provider: string
  amount: string
  originalPrice: string | null
  currency: string
  durationType: string
  durationMonths: number | null
  credits: number | null
  recommended: boolean
  isActive: boolean
  locales: string[] | null
  i18n: Record<string, { name: string; description: string }>
}

function AdminPricingPage() {
  const { lang } = Route.useParams()
  const { t } = useTranslation()
  const [plans, setPlans] = useState<PricingPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [activeTab, setActiveTab] = useState<'subscription' | 'credits'>('subscription')
  const [pricingMode, setPricingMode] = useState<string>('static')

  const tp = t.admin?.pricing

  const fetchPlans = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/pricing-plans')
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setPlans(data.plans || [])
      if (data.pricingMode) setPricingMode(data.pricingMode)
    } catch (err) {
      console.error('Error fetching plans:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPlans() }, [fetchPlans])

  const handleDelete = async (id: string) => {
    if (!confirm(tp?.confirmDelete || 'Are you sure?')) return
    const res = await fetch(`/api/admin/pricing-plans?id=${id}`, { method: 'DELETE' })
    if (res.ok) fetchPlans()
  }

  const handleToggleActive = async (plan: PricingPlan) => {
    await fetch('/api/admin/pricing-plans', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: plan.id, isActive: !plan.isActive }),
    })
    fetchPlans()
  }

  const handleImport = async () => {
    if (!confirm(tp?.importConfirm || 'Import all static plans from config?')) return
    setImporting(true)
    try {
      const res = await fetch('/api/admin/pricing-plans/import', { method: 'POST' })
      if (res.ok) { const data = await res.json(); alert(`${tp?.importSuccess} (${data.imported})`); fetchPlans() }
    } finally { setImporting(false) }
  }

  const subscriptionPlans = plans.filter(p => p.durationType !== 'credits')
  const creditPlans = plans.filter(p => p.durationType === 'credits')

  const supportedLocales = ['en', 'zh-CN']
  const coveredLocales = new Set<string>()
  plans.filter(p => p.isActive).forEach(p => {
    if (!p.locales) supportedLocales.forEach(l => coveredLocales.add(l))
    else p.locales.forEach(l => coveredLocales.add(l))
  })
  const uncoveredLocales = supportedLocales.filter(l => !coveredLocales.has(l))

  if (loading) {
    return (
      <div className="container mx-auto py-10 px-5">
        <h1 className="text-2xl font-bold mb-6">{tp?.title}</h1>
        <div className="animate-pulse text-muted-foreground">{t.common?.loading}</div>
      </div>
    )
  }

  const displayedPlans = activeTab === 'subscription' ? subscriptionPlans : creditPlans

  return (
    <div className="container mx-auto py-10 px-5">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{tp?.title}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {tp?.description}
            <Badge variant={pricingMode === 'dynamic' ? 'default' : 'secondary'} className="ml-2">
              {pricingMode === 'dynamic' ? tp?.mode?.dynamic : tp?.mode?.static}
            </Badge>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleImport} disabled={importing}>
            <Upload className="h-4 w-4 mr-2" />{importing ? tp?.importing : tp?.importStatic}
          </Button>
          <Button asChild>
            <Link to="/$lang/admin/pricing/$id" params={{ lang, id: 'new' }}>
              <Plus className="h-4 w-4 mr-2" />{tp?.createPlan}
            </Link>
          </Button>
        </div>
      </div>

      {uncoveredLocales.length > 0 && pricingMode === 'dynamic' && (
        <div className="flex items-center gap-2 p-3 mb-4 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-md">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <span className="text-sm text-yellow-800 dark:text-yellow-200">{tp?.localeCoverageWarning} [{uncoveredLocales.join(', ')}]</span>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        <Button variant={activeTab === 'subscription' ? 'default' : 'outline'} size="sm" onClick={() => setActiveTab('subscription')}>{tp?.tabs?.subscription} ({subscriptionPlans.length})</Button>
        <Button variant={activeTab === 'credits' ? 'default' : 'outline'} size="sm" onClick={() => setActiveTab('credits')}>{tp?.tabs?.credits} ({creditPlans.length})</Button>
      </div>

      {!displayedPlans.length ? (
        <p className="text-muted-foreground py-8 text-center">{tp?.noPlans}</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">{tp?.table?.name}</th>
                <th className="px-4 py-3 text-left font-medium">{tp?.table?.provider}</th>
                <th className="px-4 py-3 text-left font-medium">{tp?.table?.price}</th>
                <th className="px-4 py-3 text-left font-medium">{tp?.table?.type}</th>
                <th className="px-4 py-3 text-left font-medium">{tp?.table?.locales}</th>
                <th className="px-4 py-3 text-left font-medium">{tp?.table?.status}</th>
                <th className="px-4 py-3 text-right font-medium">{tp?.table?.actions}</th>
              </tr>
            </thead>
            <tbody>
              {displayedPlans.map(plan => (
                <tr key={plan.id} className="border-t">
                  <td className="px-4 py-3">
                    <div className="font-medium">{plan.i18n?.en?.name || plan.id}</div>
                    {plan.recommended && <Badge variant="outline" className="text-xs mt-1">{tp?.fields?.recommended}</Badge>}
                  </td>
                  <td className="px-4 py-3"><Badge variant="secondary">{plan.provider}</Badge></td>
                  <td className="px-4 py-3">
                    {plan.originalPrice && <span className="line-through text-muted-foreground mr-1">{plan.currency} {plan.originalPrice}</span>}
                    <span className="font-medium">{plan.currency} {plan.amount}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{plan.durationType}</Badge>
                    {plan.durationType === 'credits' ? ` (${plan.credits})` : plan.durationMonths ? ` (${plan.durationMonths}mo)` : ''}
                  </td>
                  <td className="px-4 py-3">
                    {plan.locales ? <span className="text-xs">{plan.locales.join(', ')}</span> : <span className="text-muted-foreground text-xs">{tp?.table?.allLocales}</span>}
                  </td>
                  <td className="px-4 py-3"><Switch checked={plan.isActive} onCheckedChange={() => handleToggleActive(plan)} /></td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="icon" asChild>
                      <Link to="/$lang/admin/pricing/$id" params={{ lang, id: plan.id }}><Pencil className="h-4 w-4" /></Link>
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(plan.id)}><Trash2 className="h-4 w-4" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
