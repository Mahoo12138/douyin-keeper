import Link from 'next/link';
import { config } from '@config';
import { translations } from '@libs/i18n';

export async function generateStaticParams() {
  return config.app.i18n.locales.map((locale) => ({
    lang: locale,
  }));
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const t = translations[lang as keyof typeof translations] || translations.en;

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-4 py-24 min-h-[calc(100vh-4rem)]">
      <div className="text-center max-w-2xl mx-auto">
        {/* Title */}
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-foreground leading-[1.1] mb-6">
          {t.docs.home.title}
        </h1>

        {/* Description */}
        <p className="text-lg text-fd-muted-foreground mb-10 max-w-lg mx-auto">
          {t.docs.home.description}
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href={`/${lang}/docs`}
            className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-fd-primary text-fd-primary-foreground font-medium transition-colors hover:bg-fd-primary/90"
          >
            {t.docs.home.cta.docs}
          </Link>
          <Link
            href={`/${lang}/blog`}
            className="inline-flex items-center justify-center px-6 py-3 rounded-lg border border-fd-border bg-fd-background font-medium transition-colors hover:bg-fd-muted"
          >
            {t.docs.home.cta.blog}
          </Link>
        </div>
      </div>
    </main>
  );
}
