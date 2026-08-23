'use client';

import { useEffect } from 'react';
import Script from 'next/script';
import Link from 'next/link';
import { useTranslation } from '@/hooks/use-translation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@libs/react-shared/ui/card';

declare global {
  interface Window {
    WxLogin: any;
  }
}

export default function WeixinLoginPage() {
  const { t, locale } = useTranslation();
  
  useEffect(() => {
    const initWxLogin = () => {
      if (typeof window.WxLogin !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const returnTo = params.get('returnTo') || '/';
        const stateData = btoa(encodeURIComponent(returnTo));
        
        new window.WxLogin({
          id: 'login_container',
          appid: process.env.NEXT_PUBLIC_WECHAT_APP_ID,
          scope: 'snsapi_login',
          redirect_uri: encodeURIComponent(`${window.location.origin}/api/auth/oauth2/callback/wechat`),
          state: stateData,
          style: 'black',
          href: `${window.location.origin}/wxLogin.css`,
        });
      }
    };

    const timer = setTimeout(initWxLogin, 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="container flex items-center justify-center min-h-screen py-6">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center">
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
                className="flex items-center justify-center min-h-[300px]"
              >
                <div className="text-center text-muted-foreground">
                  {t.auth.wechat.loadingQRCode}
                </div>
              </div>
            </div>
            <div className="text-muted-foreground text-center text-xs text-balance [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-primary">
              {t.auth.wechat.termsNotice} <a href="#">{t.auth.wechat.termsOfService}</a>
              {" "}{t.common.and} <a href="#">{t.auth.wechat.privacyPolicy}</a>.
            </div>
            <div className="flex justify-center gap-4 text-sm">
              <Link href={`/${locale}/signin`} className="text-primary hover:underline">
                {t.auth.signin.title}
              </Link>
              <span className="text-muted-foreground">|</span>
              <Link href={`/${locale}/signup`} className="text-primary hover:underline">
                {t.auth.signup.createAccount}
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
      <Script 
        src="https://res.wx.qq.com/connect/zh_CN/htmledition/js/wxLogin.js"
        strategy="afterInteractive"
      />
    </div>
  );
}
