import { createFileRoute } from '@tanstack/react-router'
import { seoHead } from '@/lib/seo'
import { useTranslation } from '@/hooks/use-translation'
import { Button } from '@libs/react-shared/ui/button'
import { XCircle } from 'lucide-react'

export const Route = createFileRoute('/$lang/(root)/payment-cancel')({
  head: ({ params }) => seoHead(params.lang, (t) => t.payment.metadata.cancel),
  component: PaymentCancelPage,
})

function PaymentCancelPage() {
  const { t, locale } = useTranslation()

  return (
    <div className="container max-w-2xl py-20">
      <div className="flex flex-col items-center space-y-6 text-center">
        <div className="rounded-full bg-red-100 p-3">
          <XCircle className="h-12 w-12 text-red-600" />
        </div>

        <h1 className="text-3xl font-bold">{t.payment.result.cancel.title}</h1>

        <p className="text-muted-foreground">
          {t.payment.result.cancel.description}
        </p>

        <div className="flex flex-col gap-4 pt-6 sm:flex-row">
          <Button asChild>
            <a href={`/${locale}/pricing`}>
              {t.payment.result.cancel.actions.tryAgain}
            </a>
          </Button>

          <Button variant="outline" asChild>
            <a href="/support">
              {t.payment.result.cancel.actions.contactSupport}
            </a>
          </Button>

          <Button variant="ghost" asChild>
            <a href={`/${locale}`}>
              {t.payment.result.cancel.actions.backToHome}
            </a>
          </Button>
        </div>
      </div>
    </div>
  )
}
