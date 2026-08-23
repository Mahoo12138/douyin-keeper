import { createFileRoute } from '@tanstack/react-router'
import { seoHead } from '@/lib/seo'
import { useTranslation } from '@/hooks/use-translation'
import { Button } from '@libs/react-shared/ui/button'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'

export const Route = createFileRoute('/$lang/(root)/payment-success')({
  head: ({ params }) => seoHead(params.lang, (t) => t.payment.metadata.success),
  component: PaymentSuccessPage,
})

function PaymentSuccessPage() {
  const { t, locale } = useTranslation()
  const [isVerifying, setIsVerifying] = useState(true)
  const [isValid, setIsValid] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sessionId = params.get('session_id')
    const provider = params.get('provider')
    const paypalCapture = params.get('paypal_capture')
    const isPaypalSubscription =
      provider === 'paypal' && params.get('subscription') === 'true'

    const skipVerification =
      provider === 'wechat' ||
      provider === 'alipay' ||
      provider === 'dodo' ||
      isPaypalSubscription ||
      (provider === 'paypal' && paypalCapture === 'success')

    if (skipVerification) {
      setIsVerifying(false)
      setIsValid(true)
      return
    }

    if (provider === 'paypal') {
      window.location.replace(`/${locale}/payment-cancel`)
      return
    }

    if (!sessionId && provider !== 'creem') {
      window.location.replace(`/${locale}`)
      return
    }

    async function verifySession() {
      try {
        let verifyUrl: string
        if (provider === 'stripe') {
          verifyUrl = `/api/payment/verify/stripe?session_id=${sessionId}`
        } else if (provider === 'creem') {
          verifyUrl = `/api/payment/verify/creem${window.location.search}`
        } else {
          verifyUrl = `/api/payment/verify/stripe?session_id=${sessionId}`
        }

        const response = await fetch(verifyUrl)
        if (!response.ok) throw new Error('Invalid session')
        await response.json()
        setIsValid(true)
      } catch (error) {
        console.error('Session verification failed:', error)
        window.location.replace(`/${locale}/pricing`)
      } finally {
        setIsVerifying(false)
      }
    }

    verifySession()
  }, [locale])

  if (isVerifying) {
    return (
      <div className="container max-w-2xl py-20">
        <div className="flex flex-col items-center space-y-6 text-center">
          <Loader2 className="text-primary h-12 w-12 animate-spin" />
          <p className="text-muted-foreground">{t.common.loading}</p>
        </div>
      </div>
    )
  }

  if (!isValid) return null

  return (
    <div className="container max-w-2xl py-20">
      <div className="flex flex-col items-center space-y-6 text-center">
        <div className="rounded-full bg-green-100 p-3">
          <CheckCircle2 className="h-12 w-12 text-green-600" />
        </div>

        <h1 className="text-3xl font-bold">
          {t.payment.result.success.title}
        </h1>

        <p className="text-muted-foreground">
          {t.payment.result.success.description}
        </p>

        <div className="flex flex-col gap-4 pt-6 sm:flex-row">
          <Button asChild>
            <a href={`/${locale}/dashboard`}>
              {t.payment.result.success.actions.viewSubscription}
            </a>
          </Button>

          <Button variant="outline" asChild>
            <a href={`/${locale}`}>
              {t.payment.result.success.actions.backToHome}
            </a>
          </Button>
        </div>
      </div>
    </div>
  )
}
