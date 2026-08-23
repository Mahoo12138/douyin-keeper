import { createFileRoute } from '@tanstack/react-router'
import { seoHead } from '@/lib/seo'
import { config } from '@config'
import { useTranslation } from '@/hooks/use-translation'
import type { Plan } from '@config'
import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from '@tanstack/react-router'
import { toast } from 'sonner'
import { authClientReact } from '@libs/auth/authClient'
import QRCode from 'qrcode'
import { motion } from 'framer-motion'
import {
  Check,
  Star,
  Sparkles,
  Crown,
  Zap,
  Shield,
  Heart,
  ArrowRight,
  Loader2,
  Coins,
  CreditCard,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@libs/react-shared/ui/dialog'
import { Steps, Step } from '@libs/react-shared/ui/steps'
import { Button } from '@libs/react-shared/ui/button'
import { cn } from '@libs/ui/utils/cn'

type PricingTab = 'subscription' | 'credits'

export const Route = createFileRoute('/$lang/(root)/pricing')({
  head: ({ params }) => seoHead(params.lang, (t) => t.pricing.metadata),
  component: PricingPage,
})

function PricingPage() {
  const { t, locale: currentLocale } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const pathname = location.pathname
  const [loading, setLoading] = useState<string | null>(null)
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null)
  const [currentPlan, setCurrentPlan] = useState<Plan | null>(null)
  const [currentStep, setCurrentStep] = useState(0)
  const [orderId, setOrderId] = useState<string | null>(null)
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null)

  const { data: session, isPending } = authClientReact.useSession()
  const user = session?.user
  const [activeTab, setActiveTab] = useState<PricingTab>('subscription')
  const [dynamicPlans, setDynamicPlans] = useState<Plan[] | null>(null)

  useEffect(() => {
    fetch('/api/pricing/plans?locale=' + currentLocale)
      .then(res => res.json())
      .then(data => setDynamicPlans(data.plans || []))
      .catch(() => setDynamicPlans(null))
  }, [currentLocale])

  const allPlans = useMemo(() => {
    if (dynamicPlans !== null) {
      return dynamicPlans
    }
    return Object.values(config.payment.plans) as unknown as Plan[]
  }, [dynamicPlans])

  const { subscriptionPlans, creditPlans } = useMemo(() => {
    const subscription: Plan[] = []
    const credits: Plan[] = []

    allPlans.forEach((plan) => {
      if ((plan as any).duration?.type === 'credits') {
        credits.push(plan)
      } else {
        subscription.push(plan)
      }
    })

    return { subscriptionPlans: subscription, creditPlans: credits }
  }, [allPlans])

  const plans = activeTab === 'subscription' ? subscriptionPlans : creditPlans

  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval)
      }
    }
  }, [pollingInterval])

  const startPolling = (orderId: string) => {
    if (pollingInterval) {
      clearInterval(pollingInterval)
    }

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/payment/query?orderId=${orderId}&provider=wechat`)
        const data = await response.json()

        if (data.status === 'paid') {
          clearInterval(interval)
          setPollingInterval(null)
          window.location.href = `/${currentLocale}/payment-success?provider=wechat`
        } else if (data.status === 'failed') {
          clearInterval(interval)
          setPollingInterval(null)
          toast.error(t.payment.result.failed)
          closeQrCodeModal()
        }
      } catch (error) {
        console.error('Payment polling error:', error)
      }
    }, 3000)

    setPollingInterval(interval)
  }

  const handleSubscribe = async (plan: Plan) => {
    try {
      if (!user) {
        const returnPath = encodeURIComponent(pathname)
        window.location.href = `/${currentLocale}/signin?returnTo=${returnPath}`
        return
      }

      setLoading(plan.id)
      const provider = plan.provider || 'stripe'
      setCurrentPlan(plan)

      const response = await fetch('/api/payment/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          planId: plan.id,
          provider,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to initiate payment')
      }

      if (provider === 'wechat') {
        if (data.paymentUrl) {
          try {
            const qrDataUrl = await QRCode.toDataURL(data.paymentUrl)
            setQrCodeUrl(qrDataUrl)
            setOrderId(data.providerOrderId)
            setCurrentStep(1)
            startPolling(data.providerOrderId)
          } catch (err) {
            console.error('QR code generation error:', err)
            toast.error(t.common.unexpectedError)
          }
        }
      } else {
        if (data.paymentUrl) {
          window.location.href = data.paymentUrl
        }
      }
    } catch (error) {
      console.error('Payment error:', error)
      toast.error(t.common.unexpectedError)
    } finally {
      setLoading(null)
    }
  }

  const closeQrCodeModal = () => {
    if (currentStep < 2 && orderId) {
      const confirmCancel = window.confirm(t.payment.confirmCancel)
      if (!confirmCancel) {
        return
      }

      fetch(`/api/payment/cancel?orderId=${orderId}&provider=wechat`, {
        method: 'POST',
      })
        .then((response) => {
          if (response.ok) {
            toast.info(t.payment.orderCanceled)
          } else {
            console.error('Failed to cancel order')
            toast.error(t.common.unexpectedError)
          }
        })
        .catch((error) => {
          console.error('Cancel order error:', error)
          toast.error(t.common.unexpectedError)
        })
    }

    setQrCodeUrl(null)
    setCurrentPlan(null)
    setCurrentStep(0)
    setOrderId(null)
    if (pollingInterval) {
      clearInterval(pollingInterval)
      setPollingInterval(null)
    }
  }

  const steps: Step[] = [
    { title: t.payment.steps.initiate, description: t.payment.steps.initiateDesc },
    { title: t.payment.steps.scan, description: t.payment.steps.scanDesc },
    { title: t.payment.steps.pay, description: t.payment.steps.payDesc },
  ]

  const getRecommendedPlan = () => {
    return plans.find((plan) => plan.recommended) || plans[0]
  }

  const recommendedPlan = getRecommendedPlan()

  return (
    <>
      <style>{`
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
        @keyframes blob {
          0% {
            transform: translate(0px, 0px) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
          100% {
            transform: translate(0px, 0px) scale(1);
          }
        }
      `}</style>

      <div className="min-h-screen bg-background">
        {/* Hero Section */}
        <section className="relative py-24 sm:py-32 overflow-hidden">
          <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
            <motion.div
              className="mx-auto max-w-4xl text-center"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              <motion.div
                className="inline-flex items-center space-x-2 px-4 py-2 bg-chart-1-bg-15 rounded-full border border-chart-1/20 mb-8"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, delay: 0.2 }}
              >
                <Sparkles className="h-4 w-4 text-chart-1" />
                <span className="text-xs font-medium text-chart-1">{t.pricing.title}</span>
              </motion.div>

              <h2 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground mb-6">
                <span className="text-gradient-chart-warm">{t.pricing.subtitle}</span>
              </h2>

              <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
                {t.pricing.description}
              </p>
            </motion.div>
          </div>
        </section>

        {/* Pricing Cards */}
        <section className="py-24">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            {/* Tab Switcher */}
            {creditPlans.length > 0 && (
              <motion.div
                className="flex justify-center mb-12"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <div className="inline-flex p-1 bg-muted rounded-xl">
                  <button
                    onClick={() => setActiveTab('subscription')}
                    className={cn(
                      'flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium transition-all duration-200',
                      activeTab === 'subscription'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <CreditCard className="h-4 w-4" />
                    {t.pricing.tabs?.subscription ||
                      (currentLocale === 'zh-CN' ? '订阅套餐' : 'Subscription')}
                  </button>
                  <button
                    onClick={() => setActiveTab('credits')}
                    className={cn(
                      'flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium transition-all duration-200',
                      activeTab === 'credits'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Coins className="h-4 w-4" />
                    {t.pricing.tabs?.credits ||
                      (currentLocale === 'zh-CN' ? '积分充值' : 'Credits')}
                  </button>
                </div>
              </motion.div>
            )}

            <div
              className={cn(
                'grid gap-8 lg:gap-12',
                plans.length === 1
                  ? 'grid-cols-1 max-w-md mx-auto'
                  : plans.length === 2
                    ? 'grid-cols-1 md:grid-cols-2 max-w-3xl mx-auto'
                    : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
              )}
            >
              {plans.map((plan, index) => {
                const i18n =
                  plan.i18n && typeof plan.i18n === 'object' ? plan.i18n[currentLocale] : undefined
                const isRecommended = plan.recommended
                const isLifetime = plan.id === 'lifetime'
                const isCreditPack = plan.duration?.type === 'credits'

                const features = i18n?.features || []

                return (
                  <motion.div
                    key={plan.id}
                    className={`relative rounded-xl p-6 shadow-lg transition-all duration-300 hover:scale-[1.02] ${
                      isRecommended
                        ? 'bg-card border-2 border-chart-1 shadow-chart-1/20'
                        : 'bg-card border border-border hover:border-border/80'
                    }`}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: index * 0.1 }}
                    viewport={{ once: true }}
                  >
                    {/* Recommended Badge */}
                    {isRecommended && (
                      <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                        <div className="inline-flex items-center space-x-2 px-3 py-1.5 bg-gradient-chart-warm text-white rounded-full shadow-md">
                          <Crown className="h-3.5 w-3.5" />
                          <span className="text-xs font-medium">{t.pricing.recommendedBadge}</span>
                        </div>
                      </div>
                    )}

                    {/* Credit Pack Badge */}
                    {isCreditPack && !isRecommended && (
                      <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                        <div className="inline-flex items-center space-x-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-full shadow-md">
                          <Coins className="h-3.5 w-3.5" />
                          <span className="text-xs font-medium">
                            {t.pricing.creditsBadge || 'Credits'}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Plan Header */}
                    <div className="text-center mb-6">
                      <h3
                        className={`text-xl font-bold mb-2 ${
                          isRecommended ? 'text-card-foreground' : 'text-foreground'
                        }`}
                      >
                        {i18n?.name || 'Plan'}
                      </h3>

                      <p
                        className={`text-sm ${
                          isRecommended ? 'text-muted-foreground' : 'text-muted-foreground'
                        }`}
                      >
                        {i18n?.description || 'Description'}
                      </p>
                    </div>

                    {/* Price */}
                    <div className="text-center mb-6">
                      <div className="flex items-baseline justify-center space-x-2">
                        {(plan as any).originalPrice && (
                          <span className="text-lg line-through text-muted-foreground">
                            {plan.currency === 'CNY' ? '¥' : '$'}
                            {(plan as any).originalPrice}
                          </span>
                        )}
                        <span
                          className={`text-4xl font-bold ${
                            isRecommended ? 'text-card-foreground' : 'text-foreground'
                          }`}
                        >
                          {plan.currency === 'CNY' ? '¥' : '$'}
                          {plan.amount}
                        </span>
                        <span
                          className={`text-base font-medium ${
                            isRecommended ? 'text-muted-foreground' : 'text-muted-foreground'
                          }`}
                        >
                          /{i18n?.duration || 'Duration'}
                        </span>
                      </div>

                      {isLifetime && (
                        <div className="mt-2 inline-flex items-center space-x-1 px-2.5 py-1 bg-chart-5-bg-15 text-chart-5 rounded-full text-xs font-medium">
                          <Heart className="h-3.5 w-3.5" />
                          <span>{t.pricing.lifetimeBadge}</span>
                        </div>
                      )}
                    </div>

                    {/* Features */}
                    <div className="space-y-3 mb-6">
                      {features.map((feature: string) => (
                        <div key={feature} className="flex items-start space-x-3">
                          <div
                            className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                              isRecommended ? 'bg-chart-1' : 'bg-chart-2-bg-15'
                            }`}
                          >
                            <Check
                              className={`h-3 w-3 ${
                                isRecommended ? 'text-white' : 'text-chart-2'
                              }`}
                            />
                          </div>
                          <span
                            className={`text-sm leading-6 ${
                              isRecommended ? 'text-card-foreground' : 'text-card-foreground'
                            }`}
                          >
                            {feature}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* CTA Button */}
                    <Button
                      onClick={() => handleSubscribe(plan)}
                      disabled={loading === plan.id || isPending}
                      className={cn(
                        'w-full py-3 rounded-lg font-semibold text-base transition-all duration-300 hover:scale-[1.02]',
                        'shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100',
                        'bg-primary text-primary-foreground hover:bg-primary/90'
                      )}
                    >
                      {loading === plan.id ? (
                        <div className="flex items-center justify-center space-x-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>{t.common.loading}</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center space-x-2">
                          <span>{t.pricing.cta}</span>
                          <ArrowRight className="h-4 w-4" />
                        </div>
                      )}
                    </Button>

                    {/* Special Effects for Recommended Plan */}
                    {isRecommended && (
                      <div className="absolute inset-0 bg-gradient-chart-warm opacity-5 rounded-xl pointer-events-none"></div>
                    )}
                  </motion.div>
                )
              })}
            </div>

            {/* Additional Info */}
            <motion.div
              className="mt-16 text-center"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              viewport={{ once: true }}
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
                <div className="flex flex-col items-center space-y-3">
                  <div className="w-12 h-12 bg-chart-2-bg-15 rounded-xl flex items-center justify-center">
                    <Shield className="h-6 w-6 text-chart-2" />
                  </div>
                  <h4 className="font-semibold text-foreground">
                    {t.pricing.features.securePayment.title}
                  </h4>
                  <p className="text-sm text-muted-foreground text-center">
                    {t.pricing.features.securePayment.description}
                  </p>
                </div>

                <div className="flex flex-col items-center space-y-3">
                  <div className="w-12 h-12 bg-chart-1-bg-15 rounded-xl flex items-center justify-center">
                    <Zap className="h-6 w-6 text-chart-1" />
                  </div>
                  <h4 className="font-semibold text-foreground">
                    {t.pricing.features.flexibleSubscription.title}
                  </h4>
                  <p className="text-sm text-muted-foreground text-center">
                    {t.pricing.features.flexibleSubscription.description}
                  </p>
                </div>

                <div className="flex flex-col items-center space-y-3">
                  <div className="w-12 h-12 bg-chart-3-bg-15 rounded-xl flex items-center justify-center">
                    <Star className="h-6 w-6 text-chart-3" />
                  </div>
                  <h4 className="font-semibold text-foreground">
                    {t.pricing.features.globalCoverage.title}
                  </h4>
                  <p className="text-sm text-muted-foreground text-center">
                    {t.pricing.features.globalCoverage.description}
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </section>
      </div>

      {/* Payment Modal */}
      <Dialog open={!!qrCodeUrl} onOpenChange={(open) => !open && closeQrCodeModal()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center">
              {currentPlan && (
                <span>
                  {currentPlan.currency === 'CNY' ? '¥' : '$'}
                  {currentPlan.amount} -{' '}
                  {currentPlan.i18n?.[currentLocale]?.name || 'Plan'}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center space-y-6">
            <Steps steps={steps} currentStep={currentStep} />
            {qrCodeUrl && (
              <div className="flex flex-col items-center space-y-4">
                <img src={qrCodeUrl} alt="WeChat Pay QR Code" className="w-64 h-64" />
                <p className="text-sm text-muted-foreground">{t.payment.scanQrCode}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
