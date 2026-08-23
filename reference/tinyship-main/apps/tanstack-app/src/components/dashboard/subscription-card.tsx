import { useEffect, useState } from 'react'
import { Button } from '@libs/react-shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@libs/react-shared/ui/card'
import { Progress } from '@libs/react-shared/ui/progress'
import { CreditCard, CalendarIcon, ExternalLink, Package, Loader2 } from 'lucide-react'
import { useTranslation } from '@/hooks/use-translation'
import { toast } from 'sonner'
import { config } from '@config'

export function SubscriptionCard() {
  const { t, locale: currentLocale } = useTranslation()
  const [subscriptionData, setSubscriptionData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [redirecting, setRedirecting] = useState(false)

  useEffect(() => {
    async function fetchSubscriptionData() {
      try {
        const response = await fetch('/api/subscription/status')
        if (response.ok) setSubscriptionData(await response.json())
      } catch (error) {
        console.error('Failed to fetch subscription data', error)
      } finally {
        setLoading(false)
      }
    }
    fetchSubscriptionData()
  }, [])

  const openCustomerPortal = async () => {
    try {
      setRedirecting(true)
      const returnUrl = `${window.location.origin}/${currentLocale}/dashboard`
      const response = await fetch('/api/subscription/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnUrl }),
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Cannot open customer portal')
      }
      const { url } = await response.json()
      window.location.href = url
    } catch (error) {
      console.error('Failed to open customer portal:', error)
      toast.error(t.common.unexpectedError)
      setRedirecting(false)
    }
  }

  const getPlanName = (planId: string) => {
    const plan = config.payment.plans[planId as keyof typeof config.payment.plans]
    if (!plan) return planId
    return plan.i18n[currentLocale]?.name || planId
  }

  const formatDate = (dateString: string | Date) => {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString
    return date.toLocaleDateString(currentLocale === 'zh-CN' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  }

  const calculateProgress = () => {
    if (!subscriptionData?.subscription) return 0
    const start = new Date(subscriptionData.subscription.periodStart).getTime()
    const end = new Date(subscriptionData.subscription.periodEnd).getTime()
    const now = Date.now()
    if (now >= end) return 100
    if (now <= start) return 0
    return Math.floor(((now - start) / (end - start)) * 100)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="text-primary h-10 w-10 animate-spin" />
        </div>
      </div>
    )
  }

  if (!subscriptionData?.hasSubscription && !subscriptionData?.isLifetime) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle>{t.subscription.noSubscription.title}</CardTitle></CardHeader>
          <CardContent>
            <p className="mb-4">{t.subscription.noSubscription.description}</p>
            <Button asChild><a href={`/${currentLocale}/pricing`}>{t.subscription.noSubscription.viewPlans}</a></Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const isLifetime = subscriptionData.isLifetime
  const sub = subscriptionData.subscription
  const planId = sub?.planId || ''

  return (
    <Card>
      <CardHeader><CardTitle>{t.subscription.title}</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center"><Package className="text-primary mr-2 h-5 w-5" /><span className="font-medium">{t.subscription.overview.planType}</span></div>
            <div className="flex items-center gap-2">
              <span className="text-primary font-medium">{isLifetime ? t.dashboard.subscription.status.lifetime : getPlanName(planId)}</span>
              {!isLifetime && sub && (
                <span className="rounded-full border px-2 py-1 text-xs">
                  {sub.paymentType === 'recurring' ? t.dashboard.subscription.paymentType.recurring : t.dashboard.subscription.paymentType.oneTime}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center"><CreditCard className="text-primary mr-2 h-5 w-5" /><span className="font-medium">{t.subscription.overview.status}</span></div>
            <div className="flex items-center gap-2">
              <span className="bg-primary text-primary-foreground rounded-full px-2 py-1 text-xs font-medium">{t.subscription.overview.active}</span>
              {sub?.cancelAtPeriodEnd && <span className="bg-accent rounded-full px-2 py-1 text-xs">{t.dashboard.subscription.status.cancelAtPeriodEnd}</span>}
            </div>
          </div>
          {!isLifetime && sub && (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center"><CalendarIcon className="text-primary mr-2 h-5 w-5" /><span className="font-medium">{t.subscription.overview.startDate}</span></div>
                <span>{formatDate(sub.periodStart)}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center"><CalendarIcon className="text-primary mr-2 h-5 w-5" /><span className="font-medium">{t.subscription.overview.endDate}</span></div>
                <span>{formatDate(sub.periodEnd)}</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between"><span className="font-medium">{t.subscription.overview.progress}</span><span>{calculateProgress()}%</span></div>
                <Progress value={calculateProgress()} className="h-2" />
              </div>
            </>
          )}
        </div>
        {(sub?.stripeCustomerId || sub?.creemCustomerId || sub?.dodoCustomerId) && (
          <div className="border-t pt-6">
            <h3 className="mb-4 text-lg font-medium">{t.subscription.management.title}</h3>
            <div className="rounded-lg border p-4">
              <p className="text-muted-foreground mb-4 text-sm">{t.subscription.management.description}</p>
              <div className="flex gap-3">
                <Button variant="default" className="flex items-center gap-1" onClick={() => openCustomerPortal()} disabled={redirecting}>
                  <ExternalLink className="h-4 w-4" />
                  {redirecting ? t.subscription.management.redirecting : t.subscription.management.manageSubscription}
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
