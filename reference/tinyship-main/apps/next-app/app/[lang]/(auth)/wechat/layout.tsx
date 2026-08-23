import { translations } from "@libs/i18n";
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const t = translations[lang as keyof typeof translations];
  
  return {
    title: t.auth.metadata.wechat.title,
    description: t.auth.metadata.wechat.description,
    keywords: t.auth.metadata.wechat.keywords,
  };
}

export default function WechatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
} 