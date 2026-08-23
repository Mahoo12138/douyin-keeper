import { use } from 'react';
import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export default function AuthLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}>) {
  const { lang } = use(params);
  return (
    <main className="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link href={`/${lang}`} className="self-center">
          <Logo size="md" />
        </Link>
        {children}
      </div>
    </main>
  );
}