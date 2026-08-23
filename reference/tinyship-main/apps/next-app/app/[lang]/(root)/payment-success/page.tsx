'use client';

import { useTranslation } from "@/hooks/use-translation";
import { Button } from "@libs/react-shared/ui/button";
import { CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState, Suspense } from "react";

function PaymentSuccessContent() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get('session_id');
  const provider = searchParams.get('provider');
  // Alipay uses out_trade_no as the order identifier
  const outTradeNo = searchParams.get('out_trade_no');
  const orderId = searchParams.get('order_id');
  const paypalCapture = searchParams.get('paypal_capture');
  const isPaypalSubscription = provider === 'paypal' && searchParams.get('subscription') === 'true';
  
  // Providers that use webhooks for confirmation don't need client-side verification
  const skipVerification = provider === 'wechat'
    || provider === 'alipay'
    || provider === 'dodo'
    || isPaypalSubscription
    || (provider === 'paypal' && paypalCapture === 'success');
  const [isVerifying, setIsVerifying] = useState(!skipVerification);
  const [isValid, setIsValid] = useState(skipVerification);

  useEffect(() => {
    // Skip verification for providers that use webhooks or already captured
    // WeChat, Alipay: payment confirmed via webhook
    // PayPal subscription: activation handled by webhook
    // PayPal capture success: already captured in return handler
    if (skipVerification) {
      return;
    }

    // PayPal without success flag means capture failed
    if (provider === 'paypal') {
      router.replace('/payment-cancel');
      return;
    }

    // For Stripe and Creem, verify the session
    if (!sessionId && provider !== 'creem') {
      router.replace('/');
      return;
    }

    async function verifySession() {
      try {
        let verifyUrl;
        if (provider === 'stripe') {
          verifyUrl = `/api/payment/verify/stripe?session_id=${sessionId}`;
        } else if (provider === 'creem') {
          // Creem verification needs the full URL (including signature)
          verifyUrl = `/api/payment/verify/creem${window.location.search}`;
        } else {
          // Default to Stripe verification (backward compatibility)
          verifyUrl = `/api/payment/verify/stripe?session_id=${sessionId}`;
        }

        const response = await fetch(verifyUrl);
        if (!response.ok) {
          throw new Error('Invalid session');
        }
        await response.json();
        setIsValid(true);
      } catch (error) {
        console.error('Session verification failed:', error);
        router.replace('/pricing');
      } finally {
        setIsVerifying(false);
      }
    }

    verifySession();
  }, [sessionId, router, provider, skipVerification]);

  if (isVerifying) {
    return (
      <div className="container max-w-2xl py-20">
        <div className="flex flex-col items-center text-center space-y-6">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-muted-foreground">{t.common.loading}</p>
        </div>
      </div>
    );
  }

  if (!isValid) {
    return null; // Router will handle the redirect
  }

  return (
    <div className="container max-w-2xl py-20">
      <div className="flex flex-col items-center text-center space-y-6">
        <div className="rounded-full bg-green-100 p-3">
          <CheckCircle2 className="h-12 w-12 text-green-600" />
        </div>
        
        <h1 className="text-3xl font-bold">
          {t.payment.result.success.title}
        </h1>
        
        <p className="text-muted-foreground">
          {t.payment.result.success.description}
        </p>

        <div className="flex flex-col sm:flex-row gap-4 pt-6">
          <Button asChild>
            <Link href="/dashboard">
              {t.payment.result.success.actions.viewSubscription}
            </Link>
          </Button>
          
          <Button variant="outline" asChild>
            <Link href="/">
              {t.payment.result.success.actions.backToHome}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="container max-w-2xl py-20">
      <div className="flex flex-col items-center text-center space-y-6">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <PaymentSuccessContent />
    </Suspense>
  );
} 