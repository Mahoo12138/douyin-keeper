import { translations } from '@libs/i18n';
import type { Metadata } from 'next';

type Props = {
  params: Promise<{ lang: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  const t = translations[lang as keyof typeof translations] || translations['zh-CN'];
  
  return {
    title: t.ai.image.metadata.title,
    description: t.ai.image.metadata.description,
    keywords: t.ai.image.metadata.keywords,
  };
}

export default function ImageGenerateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
