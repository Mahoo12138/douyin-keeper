import { translations } from "@libs/i18n";
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const t = translations[lang as keyof typeof translations];
  
  return {
    title: t.payment.metadata.cancel.title,
    description: t.payment.metadata.cancel.description,
    keywords: t.payment.metadata.cancel.keywords,
  };
}

export default function PaymentCancelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
} 