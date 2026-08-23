'use client';

import { useTranslation } from "@/hooks/use-translation";
import { Button } from "@libs/react-shared/ui/button";
import { XCircle } from "lucide-react";
import Link from "next/link";

export default function PaymentCancelPage() {
  const { t } = useTranslation();

  return (
    <div className="container max-w-2xl py-20">
      <div className="flex flex-col items-center text-center space-y-6">
        <div className="rounded-full bg-red-100 p-3">
          <XCircle className="h-12 w-12 text-red-600" />
        </div>
        
        <h1 className="text-3xl font-bold">
          {t.payment.result.cancel.title}
        </h1>
        
        <p className="text-muted-foreground">
          {t.payment.result.cancel.description}
        </p>

        <div className="flex flex-col sm:flex-row gap-4 pt-6">
          <Button asChild>
            <Link href="/pricing">
              {t.payment.result.cancel.actions.tryAgain}
            </Link>
          </Button>
          
          <Button variant="outline" asChild>
            <Link href="/support">
              {t.payment.result.cancel.actions.contactSupport}
            </Link>
          </Button>

          <Button variant="ghost" asChild>
            <Link href="/">
              {t.payment.result.cancel.actions.backToHome}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
} 