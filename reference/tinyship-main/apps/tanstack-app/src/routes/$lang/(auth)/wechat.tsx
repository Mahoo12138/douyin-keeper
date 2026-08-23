import { useEffect } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { seoHead } from '@/lib/seo'
import { useTranslation } from '@/hooks/use-translation'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@libs/react-shared/ui/card'

declare global {
  interface Window {
    WxLogin: any
  }
}

export const Route = createFileRoute('/$lang/(auth)/wechat')({
  head: ({ params }) => seoHead(params.lang, (t) => t.auth.metadata.wechat),
  component: WechatLoginPage,
})

function WechatLoginPage() {
  const { t, locale } = useTranslation()

  useEffect(() => {
    const script = document.createElement('script')
    script.src =
      'https://res.wx.qq.com/connect/zh_CN/htmledition/js/wxLogin.js'
    script.async = true
    script.onload = () => {
      if (typeof window.WxLogin !== 'undefined') {
        const params = new URLSearchParams(window.location.search)
        const returnTo = params.get('returnTo') || '/'
        const stateData = btoa(encodeURIComponent(returnTo))

        new window.WxLogin({
          id: 'login_container',
          appid: import.meta.env.VITE_WECHAT_APP_ID,
          scope: 'snsapi_login',
          redirect_uri: encodeURIComponent(
            `${window.location.origin}/api/auth/oauth2/callback/wechat`
          ),
          state: stateData,
          style: 'black',
          href: `${window.location.origin}/wxLogin.css`,
        })
      }
    }
    document.body.appendChild(script)

    return () => {
      document.body.removeChild(script)
    }
  }, [])

  return (
    <div className="container flex min-h-screen items-center justify-center py-6">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-center text-2xl">
            {t.auth.wechat.title}
          </CardTitle>
          <CardDescription className="text-center">
            {t.auth.wechat.description}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6">
            <div className="relative">
              <div
                id="login_container"
                className="flex min-h-[300px] items-center justify-center"
              >
                <div className="text-muted-foreground text-center">
                  {t.auth.wechat.loadingQRCode}
                </div>
              </div>
            </div>
            <div className="text-muted-foreground text-balance text-center text-xs [&_a:hover]:text-primary [&_a]:underline [&_a]:underline-offset-4">
              {t.auth.wechat.termsNotice}{' '}
              <a href="#">{t.auth.wechat.termsOfService}</a>{' '}
              {t.common.and}{' '}
              <a href="#">{t.auth.wechat.privacyPolicy}</a>.
            </div>
            <div className="flex justify-center gap-4 text-sm">
              <Link
                to="/$lang/signin"
                params={{ lang: locale }}
                className="text-primary hover:underline"
              >
                {t.auth.signin.title}
              </Link>
              <span className="text-muted-foreground">|</span>
              <Link
                to="/$lang/signup"
                params={{ lang: locale }}
                className="text-primary hover:underline"
              >
                {t.auth.signup.createAccount}
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
