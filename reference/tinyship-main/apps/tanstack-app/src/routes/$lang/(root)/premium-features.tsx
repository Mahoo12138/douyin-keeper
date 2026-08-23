import { createFileRoute } from '@tanstack/react-router'
import { seoHead } from '@/lib/seo'
import { useTranslation } from '@/hooks/use-translation'
import { Button } from '@libs/react-shared/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@libs/react-shared/ui/card'
import { Badge } from '@libs/react-shared/ui/badge'
import { User, Sparkles, FileText, BarChart, Loader2, Info } from 'lucide-react'
import { useEffect, useState } from 'react'
import { requireSubscription } from '@/lib/auth-guard'

export const Route = createFileRoute('/$lang/(root)/premium-features')({
  beforeLoad: async ({ params }) => {
    await requireSubscription({ params: params as { lang: string } })
  },
  head: ({ params }) => seoHead(params.lang, (t) => t.premiumFeatures.metadata),
  component: PremiumFeaturesPage,
})

function PremiumFeaturesPage() {
  const { t, locale } = useTranslation()
  const [userData, setUserData] = useState<{
    subscriptionActive: boolean
    subscriptionType: string
    isLifetime: boolean
    expiresAt?: string
  } | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchSubscriptionDetails() {
      try {
        const response = await fetch('/api/subscription/status')
        if (response.ok) {
          const data = await response.json()
          setUserData({
            subscriptionActive: data.hasSubscription,
            subscriptionType: data.isLifetime ? 'lifetime' : 'recurring',
            isLifetime: data.isLifetime,
            expiresAt: data.subscription?.periodEnd,
          })
        }
      } catch (error) {
        console.error('Failed to fetch subscription details', error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchSubscriptionDetails()
  }, [])

  const premiumFeatures = [
    { icon: <User className="h-6 w-6" />, title: t.premiumFeatures.features.userManagement.title, description: t.premiumFeatures.features.userManagement.description },
    { icon: <Sparkles className="h-6 w-6" />, title: t.premiumFeatures.features.aiAssistant.title, description: t.premiumFeatures.features.aiAssistant.description },
    { icon: <FileText className="h-6 w-6" />, title: t.premiumFeatures.features.documentProcessing.title, description: t.premiumFeatures.features.documentProcessing.description },
    { icon: <BarChart className="h-6 w-6" />, title: t.premiumFeatures.features.dataAnalytics.title, description: t.premiumFeatures.features.dataAnalytics.description },
  ]

  const formatDate = (dateString: string) => {
    const localeCode = locale === 'zh-CN' ? 'zh-CN' : 'en-US'
    return new Date(dateString).toLocaleDateString(localeCode)
  }

  if (isLoading) {
    return (
      <div className="container py-10">
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="text-primary h-10 w-10 animate-spin" />
          <span className="text-muted-foreground ml-2">{t.premiumFeatures.loading}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="container py-10">
      <div className="flex flex-col items-start gap-4 md:flex-row md:justify-between md:gap-8">
        <div className="flex-1 space-y-4">
          <div className="inline-flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{t.premiumFeatures.title}</h1>
            {userData?.isLifetime && (
              <Badge variant="outline" className="bg-chart-5-bg-15 text-chart-5 border-chart-5/20 hover:bg-chart-5-bg-15">
                {t.premiumFeatures.badges.lifetime}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">{t.premiumFeatures.description}</p>
          <div className="border-primary/20 bg-primary/5 mt-4 rounded-lg border p-4">
            <div className="flex items-start gap-3">
              <div className="bg-primary/10 mt-0.5 rounded-full p-2">
                <Info className="text-primary h-4 w-4" />
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-foreground text-sm font-medium">{t.premiumFeatures.demoNotice.title}</p>
                <p className="text-muted-foreground text-sm">{t.premiumFeatures.demoNotice.description}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {userData && (
        <Card className="mt-6 mb-8">
          <CardHeader>
            <CardTitle>{t.premiumFeatures.subscription.title}</CardTitle>
            <CardDescription>{t.premiumFeatures.subscription.description}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-3">
                <div className="text-muted-foreground text-sm font-medium">{t.premiumFeatures.subscription.status}</div>
                <div className="mt-2 flex items-center space-x-2">
                  <div className={`h-2 w-2 rounded-full ${userData.subscriptionActive ? 'bg-primary' : 'bg-destructive'}`} />
                  <span className={`text-sm font-semibold ${userData.subscriptionActive ? 'text-primary' : 'text-destructive'}`}>
                    {userData.subscriptionActive ? t.premiumFeatures.subscription.active : t.premiumFeatures.subscription.inactive}
                  </span>
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-muted-foreground text-sm font-medium">{t.premiumFeatures.subscription.type}</div>
                <div className="text-lg font-bold">
                  {userData.subscriptionType === 'lifetime' ? t.premiumFeatures.subscription.lifetime : t.premiumFeatures.subscription.recurring}
                </div>
              </div>
              {userData.expiresAt && userData.subscriptionType !== 'lifetime' && (
                <div className="rounded-lg border p-3">
                  <div className="text-muted-foreground text-sm font-medium">{t.premiumFeatures.subscription.expiresAt}</div>
                  <div className="text-lg font-bold">{formatDate(userData.expiresAt)}</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 pt-4 md:grid-cols-2 lg:grid-cols-4">
        {premiumFeatures.map((feature, index) => (
          <Card key={index} className="flex flex-col justify-between">
            <CardHeader>
              <div className="bg-primary/10 text-primary mb-4 flex h-12 w-12 items-center justify-center rounded-full">{feature.icon}</div>
              <CardTitle>{feature.title}</CardTitle>
            </CardHeader>
            <CardContent><p className="text-muted-foreground">{feature.description}</p></CardContent>
            <CardFooter><Button variant="outline" className="w-full">{t.premiumFeatures.actions.accessFeature}</Button></CardFooter>
          </Card>
        ))}
      </div>
    </div>
  )
}
