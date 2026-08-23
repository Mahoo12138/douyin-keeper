import { translations } from "@libs/i18n";
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const t = translations[lang as keyof typeof translations];
  
  return {
    title: t.premiumFeatures.metadata.title,
    description: t.premiumFeatures.metadata.description,
    keywords: t.premiumFeatures.metadata.keywords,
  };
}

export default function PremiumFeaturesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
} 