import { translations } from "@libs/i18n";
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const t = translations[lang as keyof typeof translations];
  
  return {
    title: t.auth.metadata.phone.title,
    description: t.auth.metadata.phone.description,
    keywords: t.auth.metadata.phone.keywords,
  };
}

export default function CellphoneLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
} 