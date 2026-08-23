import { translations } from "@libs/i18n";
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const t = translations[lang as keyof typeof translations];
  
  return {
    title: t.payment.metadata.success.title,
    description: t.payment.metadata.success.description,
    keywords: t.payment.metadata.success.keywords,
  };
}

export default function PaymentSuccessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
} 